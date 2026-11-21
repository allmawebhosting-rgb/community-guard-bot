import type { SupabaseClient } from "@supabase/supabase-js";
import { notifySosActivity } from "@/lib/push.functions";

export type SosActivationStage =
  | "idle"
  | "validating"
  | "creating"
  | "notifying"
  | "activated"
  | "failed";

export type SosActivationResult = {
  activityId: string;
  reused: boolean;
  notified: boolean;
  notifyDelivered: number;
  notifyRecipients: number;
  locationCaptured: boolean;
  stage: SosActivationStage;
};

export type SosActivationFailure = {
  stage: SosActivationStage;
  code: string;
  message: string;
  threadId?: string | null;
  activityId?: string | null;
};

function isMissingColumnError(error: unknown, columns: readonly string[]) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };
  if (candidate.code === "PGRST204") return true;
  const message = [candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return columns.some((column) => message.includes(column.toLowerCase()));
}

/** Short GPS probe — never blocks SOS creation. */
export function getOptionalPosition(timeoutMs = 2500): Promise<{
  lat: number;
  lng: number;
  acc: number;
} | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (value: { lat: number; lng: number; acc: number } | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timer);
        finish({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          acc: position.coords.accuracy,
        });
      },
      () => {
        window.clearTimeout(timer);
        finish(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

export async function findActiveSosForThread(
  supabase: SupabaseClient,
  threadId: string,
): Promise<string | null> {
  try {
    const { data, error } = await (supabase as any).rpc("get_chat_thread_context", {
      p_thread_id: threadId,
    });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.sos_active && row?.sos_activity_id) return String(row.sos_activity_id);
  } catch {
    /* ignore */
  }
  return null;
}

/** Persist a non-sensitive activation diagnostic for later audit. */
export async function recordSosActivationEvent(
  supabase: SupabaseClient,
  args: {
    userId: string;
    threadId?: string | null;
    activityId?: string | null;
    stage: string;
    outcome: "success" | "failure" | "retry";
    code?: string | null;
    detail?: string | null;
  },
) {
  try {
    await (supabase as any).from("sos_activation_events").insert({
      user_id: args.userId,
      thread_id: args.threadId ?? null,
      activity_id: args.activityId ?? null,
      stage: args.stage.slice(0, 64),
      outcome: args.outcome,
      error_code: args.code?.slice(0, 64) ?? null,
      detail: args.detail?.slice(0, 280) ?? null,
    });
  } catch {
    /* audit must never block SOS */
  }
}

async function insertSafetyActivity(
  supabase: SupabaseClient,
  args: {
    userId: string;
    threadId: string;
    emergencyType: string;
    channel: string;
    coords: { lat: number; lng: number; acc: number } | null;
  },
) {
  const activatedAt = new Date().toISOString();
  const details = {
    channel: args.channel,
    emergency_type: args.emergencyType,
    thread_id: args.threadId,
    location_consent: Boolean(args.coords),
    responder_notification_consent: true,
    accuracy_m: args.coords?.acc ?? null,
    activation_mode: "manual",
  };
  const baseInsert = {
    user_id: args.userId,
    activity_type: "sos_activated" as const,
    title: "Emergency SOS activated",
    summary: `SOS activated from ${args.channel} (${args.emergencyType}).`,
    severity: "critical",
    sos_status: "active",
    activated_at: activatedAt,
    location_text: args.coords ? "Live GPS location" : "Location pending",
    latitude: args.coords?.lat ?? null,
    longitude: args.coords?.lng ?? null,
    thread_id: args.threadId,
    details: details as never,
  };

  let { data, error } = await (supabase as any)
    .from("safety_activity")
    .insert(baseInsert)
    .select("id")
    .single();

  if (error && isMissingColumnError(error, ["thread_id"])) {
    const { thread_id: _ignored, ...withoutThreadColumn } = baseInsert;
    const fallback = await (supabase as any)
      .from("safety_activity")
      .insert(withoutThreadColumn)
      .select("id")
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error && isMissingColumnError(error, ["activated_at", "sos_status"])) {
    const { sos_status: _s, activated_at: _a, thread_id: threadColumn, ...rest } = baseInsert;
    const fallback = await (supabase as any)
      .from("safety_activity")
      .insert({
        ...rest,
        ...(threadColumn ? { thread_id: threadColumn } : {}),
        details: { ...details, sos_status: "active", activated_at: activatedAt } as never,
      })
      .select("id")
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error && (error as { code?: string }).code === "23505") {
    const existing = await findActiveSosForThread(supabase, args.threadId);
    if (existing) return { activityId: existing, reused: true as const, error: null };
  }

  if (error || !data?.id) {
    return {
      activityId: null,
      reused: false as const,
      error: error ?? { message: "SOS activity was not created", code: "insert_failed" },
    };
  }
  return { activityId: String(data.id), reused: false as const, error: null };
}

async function notifyWithRetry(activityId: string, attempts = 2) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await notifySosActivity({ data: { activityId } });
      return {
        notified: true,
        delivered: result.delivered ?? 0,
        recipients: result.recipients ?? 0,
        error: null as unknown,
      };
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
  }
  return { notified: false, delivered: 0, recipients: 0, error: lastError };
}

/**
 * Reliable SOS activation for the canonical chat thread:
 * session check → reuse/create case → optional location → notify network.
 * Location failure never blocks activation.
 */
export async function activateCanonicalSos(args: {
  supabase: SupabaseClient;
  userId: string;
  threadId: string;
  emergencyType: string;
  channel?: string;
  onStage?: (stage: SosActivationStage) => void;
}): Promise<SosActivationResult> {
  const { supabase, userId, threadId, emergencyType } = args;
  const channel = args.channel ?? "chat";
  const report = (stage: SosActivationStage) => args.onStage?.(stage);

  report("validating");
  if (!userId) {
    throw Object.assign(new Error("Sign in so Allma can alert your Safety Network."), {
      stage: "validating" as const,
      code: "auth_required",
    });
  }
  if (!threadId) {
    throw Object.assign(new Error("Could not open the emergency conversation."), {
      stage: "validating" as const,
      code: "thread_required",
    });
  }

  const existing = await findActiveSosForThread(supabase, threadId);
  if (existing) {
    report("activated");
    void recordSosActivationEvent(supabase, {
      userId,
      threadId,
      activityId: existing,
      stage: "reuse",
      outcome: "success",
      code: "already_active",
    });
    return {
      activityId: existing,
      reused: true,
      notified: false,
      notifyDelivered: 0,
      notifyRecipients: 0,
      locationCaptured: false,
      stage: "activated",
    };
  }

  report("creating");
  // Race a short location probe with the insert — never wait on GPS for the case.
  const coordsPromise = getOptionalPosition(2500);
  const insertPromise = insertSafetyActivity(supabase, {
    userId,
    threadId,
    emergencyType,
    channel,
    coords: null,
  });

  const inserted = await insertPromise;
  if (!inserted.activityId) {
    const message =
      typeof inserted.error === "object" &&
      inserted.error &&
      "message" in inserted.error &&
      typeof (inserted.error as { message?: unknown }).message === "string"
        ? (inserted.error as { message: string }).message
        : "SOS could not be started.";
    const code =
      typeof inserted.error === "object" &&
      inserted.error &&
      "code" in inserted.error &&
      typeof (inserted.error as { code?: unknown }).code === "string"
        ? (inserted.error as { code: string }).code
        : "insert_failed";
    void recordSosActivationEvent(supabase, {
      userId,
      threadId,
      stage: "creating",
      outcome: "failure",
      code,
      detail: message,
    });
    throw Object.assign(new Error(message), {
      stage: "creating" as const,
      code,
    });
  }

  const coords = await coordsPromise;
  if (coords) {
    void (supabase as any)
      .from("safety_activity")
      .update({
        latitude: coords.lat,
        longitude: coords.lng,
        location_text: "Live GPS location",
        details: {
          channel,
          emergency_type: emergencyType,
          thread_id: threadId,
          location_consent: true,
          responder_notification_consent: true,
          accuracy_m: coords.acc,
          activation_mode: "manual",
        },
      })
      .eq("id", inserted.activityId)
      .eq("user_id", userId)
      .then(({ error }: { error: unknown }) => {
        if (error) console.warn("SOS location attach failed", error);
      });
  }

  report("notifying");
  const notify = inserted.reused
    ? { notified: false, delivered: 0, recipients: 0, error: null }
    : await notifyWithRetry(inserted.activityId);

  if (!notify.notified && notify.error) {
    void recordSosActivationEvent(supabase, {
      userId,
      threadId,
      activityId: inserted.activityId,
      stage: "notifying",
      outcome: "failure",
      code: "notify_failed",
      detail:
        notify.error instanceof Error
          ? notify.error.message
          : "Safety Network push could not be delivered",
    });
  } else {
    void recordSosActivationEvent(supabase, {
      userId,
      threadId,
      activityId: inserted.activityId,
      stage: "activated",
      outcome: "success",
      code: inserted.reused ? "reused" : "created",
      detail: `delivered=${notify.delivered};recipients=${notify.recipients}`,
    });
  }

  report("activated");
  return {
    activityId: inserted.activityId,
    reused: inserted.reused,
    notified: notify.notified,
    notifyDelivered: notify.delivered,
    notifyRecipients: notify.recipients,
    locationCaptured: Boolean(coords),
    stage: "activated",
  };
}
