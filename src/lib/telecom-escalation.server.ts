import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  dispatchEmergencySms,
  dispatchGsmVoiceCall,
  getAfricasTalkingConfig,
  isAfricasTalkingConfigured,
  isOfficialEmergencyNumber,
  normalizeUgandanPhone,
} from "@/lib/africas-talking.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const APP_ORIGIN = () =>
  (process.env.APP_PUBLIC_URL || process.env.PUBLIC_APP_URL || "https://allmasafetyai.online")
    .trim()
    .replace(/\/$/, "");

function validateEscalate(input: { activityId: string }) {
  if (!input || typeof input.activityId !== "string" || !UUID.test(input.activityId)) {
    throw new Error("A valid SOS activity id is required.");
  }
  return { activityId: input.activityId };
}

function phoneHash(e164: string) {
  return createHash("sha256").update(e164).digest("hex").slice(0, 32);
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
        provider: "africas_talking",
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
 * Owner-only: escalate an active SOS to Africa's Talking GSM voice + SMS
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

    // Session idempotency via sos_telecom_escalations.
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

    if (!isAfricasTalkingConfigured()) {
      await (supabaseAdmin as any).from("sos_telecom_escalations").upsert(
        {
          sos_activity_id: activityId,
          user_id: userId,
          idempotency_key: idempotencyKey,
          status: "not_configured",
          provider: "africas_talking",
          contacts_targeted: 0,
          calls_queued: 0,
          sms_queued: 0,
          detail: "Africa's Talking is not configured on the server.",
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
          provider: "africas_talking",
          contacts_targeted: 0,
          calls_queued: 0,
          sms_queued: 0,
          detail: "Dialing emergency contacts via Africa's Talking GSM & SMS…",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "idempotency_key" },
      )
      .select("id")
      .maybeSingle();

    const escalationId = inserted?.id as string | undefined;
    const atConfig = getAfricasTalkingConfig()!;
    const sandbox = atConfig.environment === "sandbox";

    const [{ data: contacts }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from("emergency_contacts")
        .select("name, phone")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(20),
      supabaseAdmin.from("profiles").select("full_name, phone").eq("id", userId).maybeSingle(),
    ]);

    const numbers: string[] = [];
    for (const row of contacts ?? []) {
      const e164 = normalizeUgandanPhone(row.phone, { sandbox });
      if (!e164 || isOfficialEmergencyNumber(e164)) continue;
      if (!numbers.includes(e164)) numbers.push(e164);
    }
    // Fallback: owner's own profile phone is NOT dialed as a contact —
    // only emergency_contacts. (Owner is the person in need.)

    if (!numbers.length) {
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
    const emergencyType =
      (typeof details.emergency_type === "string" && details.emergency_type) ||
      (typeof details.type === "string" && details.type) ||
      activity.title ||
      "emergency";
    const location =
      activity.location_text ||
      (activity.latitude != null && activity.longitude != null
        ? `${Number(activity.latitude).toFixed(4)}, ${Number(activity.longitude).toFixed(4)}`
        : "their last shared area");

    const smsMessage = `EMERGENCY: ${callerName} triggered an SOS for ${String(emergencyType).slice(0, 60)} near ${String(location).slice(0, 80)}. Live emergency chat & location: ${APP_ORIGIN()}/sos?id=${activityId}`;

    await recordDeliveryAttempt(supabaseAdmin as any, {
      idempotencyKey: `gsm-voice:${activityId}`,
      kind: "gsm_voice",
      recipientUserId: userId,
      eventId: activityId,
      stage: "queued",
      devicesTargeted: numbers.length,
      detail: `env=${atConfig.environment};contacts=${numbers.length}`,
    });
    await recordDeliveryAttempt(supabaseAdmin as any, {
      idempotencyKey: `gsm-sms:${activityId}`,
      kind: "gsm_sms",
      recipientUserId: userId,
      eventId: activityId,
      stage: "queued",
      devicesTargeted: numbers.length,
      detail: `env=${atConfig.environment};contacts=${numbers.length}`,
    });

    const [voice, sms] = await Promise.all([
      dispatchGsmVoiceCall({
        to: numbers,
        callerName,
        emergencyType: String(emergencyType),
        locationText: String(location),
      }),
      dispatchEmergencySms({ to: numbers, message: smsMessage }),
    ]);

    const callsQueued = voice.success ? numbers.length : 0;
    const smsQueued = sms.success ? sms.accepted || numbers.length : 0;
    const success = voice.success || sms.success;

    await recordDeliveryAttempt(supabaseAdmin as any, {
      idempotencyKey: `gsm-voice:${activityId}`,
      kind: "gsm_voice",
      recipientUserId: userId,
      eventId: activityId,
      stage: voice.success ? "provider_accepted" : "provider_rejected",
      devicesTargeted: numbers.length,
      devicesAccepted: callsQueued,
      errorCode: voice.error,
      detail: voice.success ? `http=${voice.httpStatus}` : voice.error,
    });
    await recordDeliveryAttempt(supabaseAdmin as any, {
      idempotencyKey: `gsm-sms:${activityId}`,
      kind: "gsm_sms",
      recipientUserId: userId,
      eventId: activityId,
      stage: sms.success ? "provider_accepted" : "provider_rejected",
      devicesTargeted: numbers.length,
      devicesAccepted: smsQueued,
      errorCode: sms.error,
      detail: sms.success ? `http=${sms.httpStatus}` : sms.error,
    });

    const message = success
      ? `Alerted ${numbers.length} emergency contact${numbers.length === 1 ? "" : "s"} via direct mobile call & SMS.`
      : "Africa's Talking rejected the GSM call and SMS attempts.";

    await (supabaseAdmin as any)
      .from("sos_telecom_escalations")
      .update({
        status: success ? (voice.success && sms.success ? "completed" : "partial") : "failed",
        provider: "africas_talking",
        contacts_targeted: numbers.length,
        calls_queued: callsQueued,
        sms_queued: smsQueued,
        detail: message.slice(0, 280),
        updated_at: new Date().toISOString(),
      })
      .eq("idempotency_key", idempotencyKey);

    if (escalationId) {
      await (supabaseAdmin as any).from("sos_telecom_contact_attempts").insert(
        numbers.flatMap((e164) => {
          const hash = phoneHash(e164);
          return [
            {
              escalation_id: escalationId,
              contact_name: "Emergency contact",
              phone_hash: hash,
              channel: "voice",
              stage: voice.success ? "provider_accepted" : "provider_rejected",
              provider: "africas_talking",
              error_code: voice.error?.slice(0, 64) ?? null,
            },
            {
              escalation_id: escalationId,
              contact_name: "Emergency contact",
              phone_hash: hash,
              channel: "sms",
              stage: sms.success ? "provider_accepted" : "provider_rejected",
              provider: "africas_talking",
              error_code: sms.error?.slice(0, 64) ?? null,
            },
          ];
        }),
      );
    }

    const nextDetails = {
      ...details,
      telecom_escalation: {
        status: success ? "completed" : "failed",
        provider: "africas_talking",
        contacts_alerted: numbers.length,
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
      contactsAlerted: success ? numbers.length : 0,
      callsQueued,
      smsQueued,
      message,
    };
  });
