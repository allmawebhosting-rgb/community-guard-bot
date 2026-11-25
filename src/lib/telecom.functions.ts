import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  dispatchOfflineEmergencyVoiceAndSms,
  isTelecomConfigured,
  type TelecomDispatchResult,
} from "@/lib/telecom-call.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateTrigger(input: { activityId: string }) {
  if (!input || typeof input.activityId !== "string" || !UUID.test(input.activityId)) {
    throw new Error("A valid SOS activity id is required.");
  }
  return { activityId: input.activityId };
}

export type TelecomEscalationClientResult = TelecomDispatchResult & {
  alreadyTriggered?: boolean;
};

/**
 * Owner-only: after in-app Safety Network calls fail or have no targets,
 * place GSM voice + SMS once per SOS session via the telecom gateway.
 */
export const triggerOfflineTelecomEscalation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateTrigger)
  .handler(async ({ data, context }): Promise<TelecomEscalationClientResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const activityId = data.activityId;
    const userId = context.userId;
    const idempotencyKey = `sos-telecom:${activityId}`;

    const { data: activity, error: activityError } = await supabaseAdmin
      .from("safety_activity")
      .select("id, user_id, title, summary, location_text, latitude, longitude, details, sos_status, ended_at")
      .eq("id", activityId)
      .maybeSingle();

    if (activityError || !activity) {
      throw new Error("That SOS session could not be found.");
    }
    if (activity.user_id !== userId) {
      throw new Error("Only the person in need can trigger offline mobile fallback.");
    }
    if (activity.ended_at) {
      return {
        ok: false,
        status: "failed",
        provider: null,
        contactsTargeted: 0,
        callsQueued: 0,
        smsQueued: 0,
        message: "This SOS has already ended.",
      };
    }

    // Session idempotency — at most one telecom escalation per SOS.
    const { data: existing } = await (supabaseAdmin as any)
      .from("sos_telecom_escalations")
      .select("id, status, contacts_targeted, calls_queued, sms_queued, detail, provider")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (
      existing &&
      ["queued", "dialing", "completed", "partial", "skipped_duplicate"].includes(existing.status)
    ) {
      return {
        ok: existing.calls_queued > 0 || existing.sms_queued > 0 || existing.status === "queued",
        status: existing.status === "queued" || existing.status === "dialing" ? "completed" : existing.status,
        provider: existing.provider ?? null,
        contactsTargeted: existing.contacts_targeted ?? 0,
        callsQueued: existing.calls_queued ?? 0,
        smsQueued: existing.sms_queued ?? 0,
        message:
          existing.detail ||
          `Alerted ${existing.contacts_targeted ?? 0} emergency contacts via direct mobile call & SMS.`,
        escalationId: existing.id,
        alreadyTriggered: true,
      };
    }

    if (!isTelecomConfigured()) {
      const { data: row } = await (supabaseAdmin as any)
        .from("sos_telecom_escalations")
        .upsert(
          {
            sos_activity_id: activityId,
            user_id: userId,
            idempotency_key: idempotencyKey,
            status: "not_configured",
            contacts_targeted: 0,
            calls_queued: 0,
            sms_queued: 0,
            detail: "Telecom gateway secrets are not configured on the server.",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "idempotency_key" },
        )
        .select("id")
        .maybeSingle();
      return {
        ok: false,
        status: "not_configured",
        provider: null,
        contactsTargeted: 0,
        callsQueued: 0,
        smsQueued: 0,
        message:
          "In-app contacts unreachable. Mobile call & SMS gateway is not configured yet — use 999 / 112.",
        escalationId: row?.id,
      };
    }

    const { data: inserted, error: insertError } = await (supabaseAdmin as any)
      .from("sos_telecom_escalations")
      .upsert(
        {
          sos_activity_id: activityId,
          user_id: userId,
          idempotency_key: idempotencyKey,
          status: "queued",
          contacts_targeted: 0,
          calls_queued: 0,
          sms_queued: 0,
          detail: "Queued offline GSM voice & SMS fallback.",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "idempotency_key" },
      )
      .select("id")
      .maybeSingle();

    if (insertError || !inserted?.id) {
      // Race: another request claimed the key.
      const { data: raced } = await (supabaseAdmin as any)
        .from("sos_telecom_escalations")
        .select("id, status, contacts_targeted, calls_queued, sms_queued, detail, provider")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (raced) {
        return {
          ok: (raced.calls_queued ?? 0) > 0 || (raced.sms_queued ?? 0) > 0,
          status: "skipped_duplicate",
          provider: raced.provider ?? null,
          contactsTargeted: raced.contacts_targeted ?? 0,
          callsQueued: raced.calls_queued ?? 0,
          smsQueued: raced.sms_queued ?? 0,
          message: raced.detail || "Offline mobile fallback already started for this SOS.",
          escalationId: raced.id,
          alreadyTriggered: true,
        };
      }
      throw new Error("Could not start offline mobile fallback.");
    }

    const escalationId = inserted.id as string;

    await (supabaseAdmin as any)
      .from("sos_telecom_escalations")
      .update({ status: "dialing", updated_at: new Date().toISOString() })
      .eq("id", escalationId);

    const [{ data: contacts }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from("emergency_contacts")
        .select("name, phone")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(20),
      supabaseAdmin.from("profiles").select("full_name, phone").eq("id", userId).maybeSingle(),
    ]);

    const callerName =
      (typeof profile?.full_name === "string" && profile.full_name.trim()) ||
      "an Allma user";
    const details =
      activity.details && typeof activity.details === "object" && !Array.isArray(activity.details)
        ? (activity.details as Record<string, unknown>)
        : {};
    const emergencyType =
      (typeof details.emergency_type === "string" && details.emergency_type) ||
      (typeof details.type === "string" && details.type) ||
      activity.title ||
      "emergency";
    const locationText =
      activity.location_text ||
      (activity.latitude != null && activity.longitude != null
        ? `${Number(activity.latitude).toFixed(4)}, ${Number(activity.longitude).toFixed(4)}`
        : "their last shared area");

    const result = await dispatchOfflineEmergencyVoiceAndSms({
      activityId,
      userId,
      callerName,
      emergencyType: String(emergencyType).slice(0, 80),
      locationText: String(locationText).slice(0, 160),
      coordinates:
        activity.latitude != null && activity.longitude != null
          ? { lat: Number(activity.latitude), lng: Number(activity.longitude) }
          : null,
      contacts: (contacts ?? []).map((row) => ({
        name: row.name,
        phone: row.phone,
      })),
    });

    await (supabaseAdmin as any)
      .from("sos_telecom_escalations")
      .update({
        status: result.status,
        provider: result.provider,
        contacts_targeted: result.contactsTargeted,
        calls_queued: result.callsQueued,
        sms_queued: result.smsQueued,
        detail: result.message.slice(0, 280),
        updated_at: new Date().toISOString(),
      })
      .eq("id", escalationId);

    if (result.contactResults.length) {
      await (supabaseAdmin as any).from("sos_telecom_contact_attempts").insert(
        result.contactResults.map((row) => ({
          escalation_id: escalationId,
          contact_name: row.name.slice(0, 80),
          phone_hash: row.phoneHash,
          channel: row.channel,
          stage: row.stage,
          provider: result.provider,
          provider_ref: row.providerRef ?? null,
          error_code: row.errorCode?.slice(0, 64) ?? null,
        })),
      );
    }

    // Soft status on the activity for UI — never include phone numbers.
    const nextDetails = {
      ...details,
      telecom_escalation: {
        status: result.status,
        contacts_alerted: result.contactsTargeted,
        calls_queued: result.callsQueued,
        sms_queued: result.smsQueued,
        at: new Date().toISOString(),
        message: result.message,
      },
    };
    await supabaseAdmin
      .from("safety_activity")
      .update({ details: nextDetails as never })
      .eq("id", activityId)
      .eq("user_id", userId);

    return { ...result, escalationId };
  });
