import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  appPublicUrl,
  dispatchInfobipSms,
  dispatchInfobipTtsCall,
  isInfobipConfigured,
  isOfficialEmergencyNumber,
  normalizeInfobipPhone,
} from "@/lib/infobip.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateEscalate(input: { activityId: string }) {
  if (!input || typeof input.activityId !== "string" || !UUID.test(input.activityId)) {
    throw new Error("A valid SOS activity id is required.");
  }
  return { activityId: input.activityId };
}

function phoneHash(digits: string) {
  return createHash("sha256").update(digits).digest("hex").slice(0, 32);
}

export type EscalateSosToGsmResult = {
  success: boolean;
  contactsAlerted: number;
  callsQueued: number;
  smsQueued: number;
  message: string;
  alreadyTriggered?: boolean;
  notConfigured?: boolean;
};

async function recordDeliveryAttempt(
  admin: { from: (...args: never[]) => any },
  args: {
    idempotencyKey: string;
    kind: "gsm_voice" | "gsm_sms";
    recipientUserId: string;
    eventId: string;
    stage: string;
    devicesTargeted?: number;
    devicesAccepted?: number;
    detail?: string;
    errorCode?: string;
  },
) {
  try {
    await (admin as any).from("notification_delivery_attempts").upsert(
      {
        idempotency_key: args.idempotencyKey,
        kind: args.kind,
        recipient_user_id: args.recipientUserId,
        event_id: args.eventId,
        stage: args.stage,
        provider: "infobip",
        devices_targeted: args.devicesTargeted ?? 0,
        devices_accepted: args.devicesAccepted ?? 0,
        error_code: args.errorCode?.slice(0, 64) ?? null,
        detail: args.detail?.slice(0, 280) ?? null,
      },
      { onConflict: "idempotency_key" },
    );
  } catch (error) {
    console.warn("[gsm] delivery audit write failed", error);
  }
}

/**
 * Owner-only: escalate an active SOS to Infobip TTS voice + SMS
 * for offline / unanswered Safety Network situations.
 */
export const escalateSosToGsm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateEscalate)
  .handler(async ({ data, context }): Promise<EscalateSosToGsmResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const activityId = data.activityId;
    const userId = context.userId;
    const idempotencyKey = `sos-gsm:${activityId}`;

    const { data: activity, error: activityError } = await supabaseAdmin
      .from("safety_activity")
      .select(
        "id, user_id, title, summary, location_text, latitude, longitude, details, sos_status, ended_at",
      )
      .eq("id", activityId)
      .maybeSingle();

    if (activityError || !activity) {
      throw new Error("That SOS session could not be found.");
    }
    if (activity.user_id !== userId) {
      throw new Error("Only the person in need can trigger GSM emergency fallback.");
    }
    if (activity.ended_at) {
      return {
        success: false,
        contactsAlerted: 0,
        callsQueued: 0,
        smsQueued: 0,
        message: "This SOS has already ended.",
      };
    }

    const { data: existing } = await (supabaseAdmin as any)
      .from("sos_telecom_escalations")
      .select("id, status, contacts_targeted, calls_queued, sms_queued, detail")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (
      existing &&
      ["queued", "dialing", "completed", "partial", "skipped_duplicate"].includes(existing.status)
    ) {
      const alerted = existing.contacts_targeted ?? 0;
      const ok = (existing.calls_queued ?? 0) > 0 || (existing.sms_queued ?? 0) > 0;
      return {
        success: ok,
        contactsAlerted: alerted,
        callsQueued: existing.calls_queued ?? 0,
        smsQueued: existing.sms_queued ?? 0,
        message:
          existing.detail ||
          `Alerted ${alerted} emergency contacts via direct mobile call & SMS.`,
        alreadyTriggered: true,
      };
    }

    if (!isInfobipConfigured()) {
      await (supabaseAdmin as any).from("sos_telecom_escalations").upsert(
        {
          sos_activity_id: activityId,
          user_id: userId,
          idempotency_key: idempotencyKey,
          status: "not_configured",
          provider: "infobip",
          contacts_targeted: 0,
          calls_queued: 0,
          sms_queued: 0,
          detail: "Infobip is not configured on the server.",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "idempotency_key" },
      );
      return {
        success: false,
        contactsAlerted: 0,
        callsQueued: 0,
        smsQueued: 0,
        message:
          "Safety network offline or unreachable. Mobile GSM gateway is not configured yet — use 999 / 112.",
        notConfigured: true,
      };
    }

    const { data: inserted } = await (supabaseAdmin as any)
      .from("sos_telecom_escalations")
      .upsert(
        {
          sos_activity_id: activityId,
          user_id: userId,
          idempotency_key: idempotencyKey,
          status: "dialing",
          provider: "infobip",
          contacts_targeted: 0,
          calls_queued: 0,
          sms_queued: 0,
          detail: "Dialing emergency contacts via Infobip GSM & SMS…",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "idempotency_key" },
      )
      .select("id")
      .maybeSingle();

    const escalationId = inserted?.id as string | undefined;

    const [{ data: contacts }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from("emergency_contacts")
        .select("name, phone")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(20),
      supabaseAdmin.from("profiles").select("full_name, phone").eq("id", userId).maybeSingle(),
    ]);

    const dialList: Array<{ name: string; to: string }> = [];
    const seen = new Set<string>();
    for (const row of contacts ?? []) {
      const to = normalizeInfobipPhone(row.phone);
      if (!to || isOfficialEmergencyNumber(to)) continue;
      if (seen.has(to)) continue;
      seen.add(to);
      dialList.push({
        name: (row.name || "Emergency contact").trim().slice(0, 80) || "Emergency contact",
        to,
      });
    }

    if (!dialList.length) {
      await (supabaseAdmin as any)
        .from("sos_telecom_escalations")
        .update({
          status: "failed",
          contacts_targeted: 0,
          detail: "No dialable emergency contact phone numbers on file.",
          updated_at: new Date().toISOString(),
        })
        .eq("idempotency_key", idempotencyKey);
      return {
        success: false,
        contactsAlerted: 0,
        callsQueued: 0,
        smsQueued: 0,
        message: "No dialable emergency contact phone numbers on file.",
      };
    }

    const details =
      activity.details && typeof activity.details === "object" && !Array.isArray(activity.details)
        ? (activity.details as Record<string, unknown>)
        : {};
    const callerName =
      (typeof profile?.full_name === "string" && profile.full_name.trim()) || "an Allma user";
    const origin = appPublicUrl();
    const smsText = `EMERGENCY: ${callerName} triggered SOS. Live location: ${origin}/sos?id=${activityId}`;

    await recordDeliveryAttempt(supabaseAdmin as any, {
      idempotencyKey: `gsm-voice:${activityId}`,
      kind: "gsm_voice",
      recipientUserId: userId,
      eventId: activityId,
      stage: "queued",
      devicesTargeted: dialList.length,
      detail: `provider=infobip;contacts=${dialList.length}`,
    });
    await recordDeliveryAttempt(supabaseAdmin as any, {
      idempotencyKey: `gsm-sms:${activityId}`,
      kind: "gsm_sms",
      recipientUserId: userId,
      eventId: activityId,
      stage: "queued",
      devicesTargeted: dialList.length,
      detail: `provider=infobip;contacts=${dialList.length}`,
    });

    let callsQueued = 0;
    let smsQueued = 0;
    const contactAttempts: Array<{
      contact_name: string;
      phone_hash: string;
      channel: "voice" | "sms";
      stage: string;
      provider_ref: string | null;
      error_code: string | null;
      detail: string | null;
    }> = [];

    // Sequential per contact: failure on one must not stop the rest.
    for (const contact of dialList) {
      const hash = phoneHash(contact.to);

      const voice = await dispatchInfobipTtsCall({
        to: contact.to,
        callerName,
      });
      if (voice.success) {
        callsQueued += 1;
        contactAttempts.push({
          contact_name: contact.name,
          phone_hash: hash,
          channel: "voice",
          stage: "provider_accepted",
          provider_ref: voice.messageId ?? null,
          error_code: null,
          detail: voice.status ? `status=${voice.status}` : null,
        });
      } else {
        console.error("[infobip] voice failed for contact", {
          phoneHash: hash,
          error: voice.error,
          body: voice.body,
        });
        contactAttempts.push({
          contact_name: contact.name,
          phone_hash: hash,
          channel: "voice",
          stage: "provider_rejected",
          provider_ref: voice.messageId ?? null,
          error_code: voice.error?.slice(0, 64) ?? "voice_failed",
          detail: voice.body?.slice(0, 200) ?? null,
        });
      }

      const sms = await dispatchInfobipSms({ to: contact.to, text: smsText });
      if (sms.success) {
        smsQueued += 1;
        contactAttempts.push({
          contact_name: contact.name,
          phone_hash: hash,
          channel: "sms",
          stage: "provider_accepted",
          provider_ref: sms.messageId ?? null,
          error_code: null,
          detail: sms.status ? `status=${sms.status}` : null,
        });
      } else {
        console.error("[infobip] sms failed for contact", {
          phoneHash: hash,
          error: sms.error,
          body: sms.body,
        });
        contactAttempts.push({
          contact_name: contact.name,
          phone_hash: hash,
          channel: "sms",
          stage: "provider_rejected",
          provider_ref: sms.messageId ?? null,
          error_code: sms.error?.slice(0, 64) ?? "sms_failed",
          detail: sms.body?.slice(0, 200) ?? null,
        });
      }
    }

    const success = callsQueued > 0 || smsQueued > 0;
    const contactsAlerted = dialList.filter((c) =>
      contactAttempts.some(
        (a) => a.phone_hash === phoneHash(c.to) && a.stage === "provider_accepted",
      ),
    ).length;

    await recordDeliveryAttempt(supabaseAdmin as any, {
      idempotencyKey: `gsm-voice:${activityId}`,
      kind: "gsm_voice",
      recipientUserId: userId,
      eventId: activityId,
      stage: callsQueued > 0 ? "provider_accepted" : "provider_rejected",
      devicesTargeted: dialList.length,
      devicesAccepted: callsQueued,
      errorCode: callsQueued > 0 ? undefined : "all_voice_failed",
      detail: `callsQueued=${callsQueued}`,
    });
    await recordDeliveryAttempt(supabaseAdmin as any, {
      idempotencyKey: `gsm-sms:${activityId}`,
      kind: "gsm_sms",
      recipientUserId: userId,
      eventId: activityId,
      stage: smsQueued > 0 ? "provider_accepted" : "provider_rejected",
      devicesTargeted: dialList.length,
      devicesAccepted: smsQueued,
      errorCode: smsQueued > 0 ? undefined : "all_sms_failed",
      detail: `smsQueued=${smsQueued}`,
    });

    const message = success
      ? `Alerted ${contactsAlerted || dialList.length} emergency contact${(contactsAlerted || dialList.length) === 1 ? "" : "s"} via direct mobile call & SMS.`
      : "Infobip rejected the GSM call and SMS attempts.";

    await (supabaseAdmin as any)
      .from("sos_telecom_escalations")
      .update({
        status: success
          ? callsQueued === dialList.length && smsQueued === dialList.length
            ? "completed"
            : "partial"
          : "failed",
        provider: "infobip",
        contacts_targeted: dialList.length,
        calls_queued: callsQueued,
        sms_queued: smsQueued,
        detail: message.slice(0, 280),
        updated_at: new Date().toISOString(),
      })
      .eq("idempotency_key", idempotencyKey);

    if (escalationId && contactAttempts.length) {
      await (supabaseAdmin as any).from("sos_telecom_contact_attempts").insert(
        contactAttempts.map((row) => ({
          escalation_id: escalationId,
          contact_name: row.contact_name,
          phone_hash: row.phone_hash,
          channel: row.channel,
          stage: row.stage,
          provider: "infobip",
          provider_ref: row.provider_ref,
          error_code: row.error_code,
          detail: row.detail,
        })),
      );
    }

    const nextDetails = {
      ...details,
      telecom_escalation: {
        status: success ? "completed" : "failed",
        provider: "infobip",
        contacts_alerted: contactsAlerted || (success ? dialList.length : 0),
        calls_queued: callsQueued,
        sms_queued: smsQueued,
        at: new Date().toISOString(),
        message,
      },
    };
    await supabaseAdmin
      .from("safety_activity")
      .update({ details: nextDetails as never })
      .eq("id", activityId)
      .eq("user_id", userId);

    return {
      success,
      contactsAlerted: success ? contactsAlerted || dialList.length : 0,
      callsQueued,
      smsQueued,
      message,
    };
  });
