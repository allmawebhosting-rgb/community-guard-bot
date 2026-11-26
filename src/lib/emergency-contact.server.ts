/**
 * Emergency auto-contact: finds real nearby health facilities, then — after a short cancellable
 * countdown — emails and phones them on the user's behalf. Cloudflare Workers has no cron or
 * queue here, so the open chat card drives the run one action at a time through `advance`.
 */
import type { Incident } from "@/lib/allma-emergency-playbook";
import {
  EMERGENCY_COUNTDOWN_SECONDS,
  EMERGENCY_EMAIL_CAP,
  emergencyCallScript,
  emergencyEmailBody,
  emergencySubject,
  mapsLinkFor,
  mapsSearchLink,
  type EmergencyContext,
  type EmergencyFacility,
} from "@/lib/emergency-contact-plan";
import { inUganda } from "@/lib/nearby-guard";
import { getNearestUgandaPlace, resolveUgandaPlace } from "@/lib/uganda-places";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const RECENT_RUN_WINDOW_MS = 30 * 60 * 1000;
const STALE_ACTION_MS = 90 * 1000;
const COUNTDOWN_GRACE_MS = 2 * 60 * 1000;
const UNARMED_RUN_MS = 5 * 60 * 1000;
const TERMINAL = new Set(["completed", "cancelled", "no_facilities", "expired"]);

export type EmergencyActionView = {
  id: string;
  seq: number;
  channel: "call" | "email";
  facility_name: string;
  facility_address: string | null;
  distance_m: number | null;
  destination: string;
  status: string;
  detail: string | null;
};

export type EmergencyFacilityView = {
  name: string;
  address: string | null;
  distance_m: number;
  phone: string | null;
  email: string | null;
  open_note: string | null;
};

export type EmergencyRunView = {
  run_id: string;
  status: string;
  countdown_seconds: number;
  countdown_ends_at: string | null;
  server_now: string;
  incident: string;
  place: string | null;
  location_source: "gps" | "town";
  email_via: "gmail" | "allma";
  gmail_email: string | null;
  facilities: EmergencyFacilityView[];
  actions: EmergencyActionView[];
};

type StoredContext = {
  ctx: EmergencyContext;
  facilities: EmergencyFacility[];
  location_source: "gps" | "town";
  gmail_email: string | null;
  account_email: string | null;
};

async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

function openNote(facility: EmergencyFacility) {
  if (facility.is_24h) return "Open 24 hours";
  if (facility.open_now === true) return "Open now";
  return null;
}

async function loadView(db: Db, runId: string, userId: string): Promise<EmergencyRunView | null> {
  const { data: run } = await db
    .from("emergency_contact_runs")
    .select("id, status, countdown_ends_at, context")
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!run) return null;
  const { data: actions } = await db
    .from("emergency_contact_actions")
    .select("id, seq, channel, facility_name, facility_address, distance_m, destination, status, detail")
    .eq("run_id", runId)
    .order("seq", { ascending: true });
  const stored = run.context as StoredContext;
  return {
    run_id: run.id,
    status: run.status,
    countdown_seconds: EMERGENCY_COUNTDOWN_SECONDS,
    countdown_ends_at: run.countdown_ends_at,
    server_now: new Date().toISOString(),
    incident: stored.ctx.incident,
    place: stored.ctx.place,
    location_source: stored.location_source,
    email_via: stored.gmail_email ? "gmail" : "allma",
    gmail_email: stored.gmail_email,
    facilities: stored.facilities.map((facility) => ({
      name: facility.name,
      address: facility.address,
      distance_m: facility.distance_m,
      phone: facility.phone,
      email: facility.email,
      open_note: openNote(facility),
    })),
    actions: (actions ?? []) as EmergencyActionView[],
  };
}

export type StartEmergencyInput = {
  userId: string;
  threadId: string | null;
  sosActivityId: string | null;
  trigger: "chat" | "sos";
  incident: Pick<Incident, "label">;
  /** The user's words that reported the emergency. */
  reportText: string;
  /** Texts to look for a typed town in, newest first. */
  placeTexts: string[];
  coords: { latitude: number; longitude: number } | null;
};

export type StartEmergencyResult =
  | { ok: true; reused: false; view: EmergencyRunView }
  | { ok: true; reused: true; runId: string }
  | { ok: false; reason: "no_location" | "unavailable" };

function cleanSituation(text: string) {
  const cleaned = text
    .replace(/my current location is:?\s*/gi, "")
    .replace(/-?\d{1,2}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?\s]+$/, "");
  return cleaned.length >= 4 ? cleaned.slice(0, 200) : null;
}

/** Live SOS fix first, then shared GPS, then the town the user typed. Never (0, 0), never outside Uganda. */
export async function resolveEmergencyLocation(input: {
  db: Db;
  userId: string;
  sosActivityId: string | null;
  coords: { latitude: number; longitude: number } | null;
  placeTexts: string[];
}) {
  let point: { lat: number; lng: number } | null = null;
  if (input.sosActivityId) {
    const { data } = await input.db
      .from("safety_activity")
      .select("latitude, longitude")
      .eq("id", input.sosActivityId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (data && typeof data.latitude === "number" && typeof data.longitude === "number") {
      point = { lat: data.latitude, lng: data.longitude };
    }
  }
  if (!point && input.coords) point = { lat: input.coords.latitude, lng: input.coords.longitude };
  if (point && !(Number.isFinite(point.lat) && Number.isFinite(point.lng) && inUganda(point.lat, point.lng))) point = null;

  const named = input.placeTexts.map((text) => resolveUgandaPlace(text)).find(Boolean) ?? null;
  if (point) {
    const place = named?.name ?? getNearestUgandaPlace(point)?.name ?? null;
    return { lat: point.lat, lng: point.lng, place, source: "gps" as const };
  }
  if (named) return { lat: named.lat, lng: named.lng, place: named.name, source: "town" as const };
  return null;
}

export async function startEmergencyRun(input: StartEmergencyInput): Promise<StartEmergencyResult> {
  try {
    const db = await admin();

    // One run per person per half hour: a follow-up message must not ring the hospitals again.
    const since = new Date(Date.now() - RECENT_RUN_WINDOW_MS).toISOString();
    const { data: recent } = await db
      .from("emergency_contact_runs")
      .select("id")
      .eq("user_id", input.userId)
      .neq("status", "no_facilities")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    if (recent?.[0]) return { ok: true, reused: true, runId: String(recent[0].id) };

    const location = await resolveEmergencyLocation({
      db,
      userId: input.userId,
      sosActivityId: input.sosActivityId,
      coords: input.coords,
      placeTexts: input.placeTexts,
    });
    if (!location) return { ok: false, reason: "no_location" };

    const [{ findEmergencyFacilities, reverseGeocode }, { getEmailConnection }] = await Promise.all([
      import("@/lib/emergency-facilities.server"),
      import("@/lib/gmail-connection.server"),
    ]);
    const [facilities, address, gmail, profileRes, authRes] = await Promise.all([
      findEmergencyFacilities(location.lat, location.lng),
      location.source === "gps" ? reverseGeocode(location.lat, location.lng) : Promise.resolve(null),
      getEmailConnection(input.userId).then((c) => c, () => null),
      db.from("profiles").select("full_name, phone, phone_e164").eq("id", input.userId).maybeSingle(),
      db.auth.admin.getUserById(input.userId).then((r: { data?: { user?: { email?: string } } }) => r, () => null),
    ]);
    const profile = profileRes?.data as { full_name?: string | null; phone?: string | null; phone_e164?: string | null } | null;
    const name = (profile?.full_name ?? "").replace(/\s+/g, " ").trim() || null;
    const phone = (profile?.phone_e164 ?? profile?.phone ?? "").trim() || null;

    const ctx: EmergencyContext = {
      name: name && !/[@\d[\]]/.test(name) ? name : null,
      phone,
      incident: input.incident.label,
      situation: cleanSituation(input.reportText),
      place: location.place,
      address,
      mapsLink:
        location.source === "gps"
          ? mapsLinkFor(location.lat, location.lng)
          : mapsSearchLink(location.place ?? "Uganda"),
    };
    const stored: StoredContext = {
      ctx,
      facilities,
      location_source: location.source,
      gmail_email: gmail?.email ?? null,
      account_email: authRes?.data?.user?.email ?? null,
    };

    const { data: run, error } = await db
      .from("emergency_contact_runs")
      .insert({
        user_id: input.userId,
        thread_id: input.threadId,
        sos_activity_id: input.sosActivityId,
        trigger: input.trigger,
        status: facilities.length ? "countdown" : "no_facilities",
        context: stored,
        finished_at: facilities.length ? null : new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !run) return { ok: false, reason: "unavailable" };

    // Emails first (they carry the map link the call refers to), then calls, nearest first.
    const rows: Array<Record<string, unknown>> = [];
    let seq = 0;
    const base = (facility: EmergencyFacility) => ({
      run_id: run.id,
      user_id: input.userId,
      facility_name: facility.name.slice(0, 160),
      facility_address: facility.address?.slice(0, 240) ?? null,
      distance_m: Math.round(facility.distance_m),
    });
    for (const facility of facilities) {
      if (facility.email) rows.push({ ...base(facility), seq: ++seq, channel: "email", destination: facility.email });
    }
    for (const facility of facilities) {
      if (facility.phone) rows.push({ ...base(facility), seq: ++seq, channel: "call", destination: facility.phone });
    }
    if (rows.length) await db.from("emergency_contact_actions").insert(rows);

    const view = await loadView(db, run.id, input.userId);
    return view ? { ok: true, reused: false, view } : { ok: false, reason: "unavailable" };
  } catch (error) {
    console.error("[emergency-contact] start failed", error instanceof Error ? error.message : "unknown");
    return { ok: false, reason: "unavailable" };
  }
}

async function finishRun(db: Db, runId: string, status: "completed" | "cancelled" | "expired") {
  await db
    .from("emergency_contact_runs")
    .update({ status, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", runId)
    .in("status", ["countdown", "running"]);
}

async function cancelPending(db: Db, runId: string, detail: string, to: "cancelled" | "skipped" = "cancelled") {
  await db
    .from("emergency_contact_actions")
    .update({ status: to, detail, updated_at: new Date().toISOString() })
    .eq("run_id", runId)
    .eq("status", "pending");
}

export async function armEmergencyRun(userId: string, runId: string): Promise<EmergencyRunView | null> {
  const db = await admin();
  const { data: run } = await db
    .from("emergency_contact_runs")
    .select("id, status, countdown_ends_at, created_at")
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!run) return null;
  if (run.status === "countdown" && !run.countdown_ends_at) {
    if (Date.now() - new Date(run.created_at).getTime() > UNARMED_RUN_MS) {
      await finishRun(db, runId, "expired");
      await cancelPending(db, runId, "The countdown was never shown, so nothing was sent");
    } else {
      await db
        .from("emergency_contact_runs")
        .update({
          countdown_ends_at: new Date(Date.now() + EMERGENCY_COUNTDOWN_SECONDS * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId)
        .is("countdown_ends_at", null);
    }
  }
  return loadView(db, runId, userId);
}

export async function cancelEmergencyRun(userId: string, runId: string): Promise<EmergencyRunView | null> {
  const db = await admin();
  const { data: run } = await db
    .from("emergency_contact_runs")
    .select("id, status")
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!run) return null;
  if (!TERMINAL.has(run.status)) {
    await finishRun(db, runId, "cancelled");
    await cancelPending(db, runId, "Cancelled by you");
  }
  return loadView(db, runId, userId);
}

export async function getEmergencyRunView(userId: string, runId: string) {
  return loadView(await admin(), runId, userId);
}

type ActionRow = {
  id: string;
  channel: "call" | "email";
  facility_name: string;
  destination: string;
  seq: number;
};

async function logSystemEmail(
  db: Db,
  row: { userId: string; runId: string; to: string; subject: string; ok: boolean; error?: string },
) {
  await db
    .from("email_sends")
    .insert({
      user_id: row.userId,
      to_email: row.to,
      subject: row.subject,
      gmail_message_id: null,
      status: row.ok ? "sent" : "failed",
      error: row.ok ? "sent_via_allma_system_email" : (row.error ?? "failed"),
      kind: "emergency",
      emergency_run_id: row.runId,
    })
    .then(() => undefined, () => undefined);
}

async function runEmailAction(
  db: Db,
  userId: string,
  runId: string,
  stored: StoredContext,
  action: ActionRow,
): Promise<{ status: "sent" | "failed"; detail: string; messageId: string | null }> {
  const subject = emergencySubject(stored.ctx);
  const text = emergencyEmailBody(stored.ctx, { facilityName: action.facility_name });
  let gmailNote = "";

  if (stored.gmail_email) {
    const { sendGmail } = await import("@/lib/gmail-connection.server");
    const sent = await sendGmail(userId, { to: action.destination, subject, body: text }, { emergencyRunId: runId });
    if (sent.success) {
      return { status: "sent", detail: `Sent from your Gmail (${sent.from})`, messageId: sent.messageId };
    }
    if (sent.error === "emergency_cap") {
      return { status: "failed", detail: `Emergency email limit (${EMERGENCY_EMAIL_CAP}) reached`, messageId: null };
    }
    gmailNote = "Your Gmail could not send it, so ";
  }

  const { count } = await db
    .from("email_sends")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "emergency")
    .eq("emergency_run_id", runId)
    .eq("status", "sent");
  if ((count ?? 0) >= EMERGENCY_EMAIL_CAP) {
    return { status: "failed", detail: `Emergency email limit (${EMERGENCY_EMAIL_CAP}) reached`, messageId: null };
  }

  const { sendSystemTextEmail } = await import("@/lib/agent-email.server");
  const result = await sendSystemTextEmail({
    to: action.destination,
    subject,
    text: `${text}\n\nSent on behalf of the person above from Allma's system email because ${stored.gmail_email ? "their Gmail could not send it" : "they have not connected Gmail"}.`,
    replyTo: stored.account_email,
  });
  await logSystemEmail(db, { userId, runId, to: action.destination, subject, ok: result.success, error: result.error });
  if (result.success) {
    return {
      status: "sent",
      detail: gmailNote
        ? `${gmailNote}it was sent from Allma's system email`
        : "Gmail is not connected, so it was sent from Allma's system email",
      messageId: result.messageId,
    };
  }
  return { status: "failed", detail: result.error === "email_not_configured" ? "Email sending is not set up" : "Email failed to send", messageId: null };
}

async function runCallAction(stored: StoredContext, action: ActionRow) {
  const { callFacility } = await import("@/lib/facility-call.server");
  const facility = stored.facilities.find((f) => f.name === action.facility_name || f.phone === action.destination);
  const text = emergencyCallScript(stored.ctx, { mapsInEmail: Boolean(facility?.email) });
  const outcome = await callFacility({ to: action.destination, text });
  return { status: outcome.status, detail: outcome.detail, messageId: outcome.messageId };
}

/**
 * Moves the run forward by one step: starts it when the countdown is over, then performs the next
 * pending email or call. Safe to call repeatedly and from several tabs; a step runs only once.
 */
export async function advanceEmergencyRun(userId: string, runId: string): Promise<EmergencyRunView | null> {
  const db = await admin();
  const { data: run } = await db
    .from("emergency_contact_runs")
    .select("id, status, countdown_ends_at, context")
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!run) return null;
  if (TERMINAL.has(run.status)) return loadView(db, runId, userId);

  if (run.status === "countdown") {
    if (!run.countdown_ends_at) return loadView(db, runId, userId);
    const endsAt = new Date(run.countdown_ends_at).getTime();
    if (Date.now() < endsAt) return loadView(db, runId, userId);
    if (Date.now() - endsAt > COUNTDOWN_GRACE_MS) {
      await finishRun(db, runId, "expired");
      await cancelPending(db, runId, "The countdown ended while the chat was closed, so nothing was sent");
      return loadView(db, runId, userId);
    }
    await db
      .from("emergency_contact_runs")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", runId)
      .eq("status", "countdown");
  }

  const staleBefore = new Date(Date.now() - STALE_ACTION_MS).toISOString();
  await db
    .from("emergency_contact_actions")
    .update({ status: "failed", detail: "Interrupted before it finished", updated_at: new Date().toISOString() })
    .eq("run_id", runId)
    .eq("status", "running")
    .lt("updated_at", staleBefore);

  const { data: active } = await db
    .from("emergency_contact_actions")
    .select("id")
    .eq("run_id", runId)
    .eq("status", "running")
    .limit(1);
  if (active?.length) return loadView(db, runId, userId);

  const { data: nextRows } = await db
    .from("emergency_contact_actions")
    .select("id, channel, facility_name, destination, seq")
    .eq("run_id", runId)
    .eq("status", "pending")
    .order("seq", { ascending: true })
    .limit(1);
  const next = nextRows?.[0] as ActionRow | undefined;
  if (!next) {
    await finishRun(db, runId, "completed");
    return loadView(db, runId, userId);
  }

  const { data: claimed } = await db
    .from("emergency_contact_actions")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", next.id)
    .eq("status", "pending")
    .select("id");
  if (!claimed?.length) return loadView(db, runId, userId);

  const stored = run.context as StoredContext;
  let result: { status: string; detail: string; messageId: string | null };
  try {
    result = next.channel === "email" ? await runEmailAction(db, userId, runId, stored, next) : await runCallAction(stored, next);
  } catch (error) {
    console.error("[emergency-contact] action failed", next.channel, error instanceof Error ? error.message : "unknown");
    result = { status: "failed", detail: "Something went wrong", messageId: null };
  }
  await db
    .from("emergency_contact_actions")
    .update({
      status: result.status,
      detail: result.detail.slice(0, 240),
      provider_message_id: result.messageId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", next.id);

  if (next.channel === "call" && result.status === "answered") {
    await cancelPending(db, runId, "A facility already answered", "skipped");
  }
  const { data: left } = await db
    .from("emergency_contact_actions")
    .select("id")
    .eq("run_id", runId)
    .in("status", ["pending", "running"])
    .limit(1);
  if (!left?.length) await finishRun(db, runId, "completed");
  return loadView(db, runId, userId);
}
