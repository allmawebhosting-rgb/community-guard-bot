import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PushConfig = { supported: boolean; publicKey: string | null };

/** The VAPID public key is safe to hand to the browser; the private key never leaves the server. */
export const getPushConfig = createServerFn({ method: "GET" }).handler(async (): Promise<PushConfig> => {
  const publicKey = process.env["VAPID_PUBLIC_KEY"] ?? null;
  return { supported: Boolean(publicKey), publicKey };
});

type SubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
};

function validateSubscription(input: SubscriptionInput) {
  if (!input || typeof input.endpoint !== "string" || !/^https:\/\//.test(input.endpoint)) {
    throw new Error("A valid push endpoint is required.");
  }
  if (input.endpoint.length > 1000) throw new Error("That push endpoint is not valid.");
  if (typeof input.p256dh !== "string" || input.p256dh.length < 10 || input.p256dh.length > 500) {
    throw new Error("That push subscription is missing its encryption key.");
  }
  if (typeof input.auth !== "string" || input.auth.length < 5 || input.auth.length > 500) {
    throw new Error("That push subscription is missing its auth secret.");
  }
  return {
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
    userAgent: typeof input.userAgent === "string" ? input.userAgent.slice(0, 300) : undefined,
  };
}

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateSubscription)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth_key: data.auth,
        user_agent: data.userAgent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error("We could not register this device for call alerts.");
    return { ok: true };
  });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { endpoint: string }) => {
    if (!input || typeof input.endpoint !== "string" || !/^https:\/\//.test(input.endpoint)) {
      throw new Error("A valid push endpoint is required.");
    }
    return { endpoint: input.endpoint };
  })
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", context.userId)
      .eq("endpoint", data.endpoint);
    return { ok: true };
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Notifies the recipient of a call on every device they registered, so an
 * incoming call still rings when the app is closed or backgrounded.
 * Best-effort: the OS may delay or drop the notification.
 */
export const notifyIncomingCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { callId: string }) => {
    if (!input || typeof input.callId !== "string" || !UUID.test(input.callId)) {
      throw new Error("A valid call id is required.");
    }
    return { callId: input.callId };
  })
  .handler(async ({ data, context }) => {
    const { data: call } = await context.supabase
      .from("emergency_calls")
      .select("id, caller_id, recipient_id, status, sos_session_id, created_at")
      .eq("id", data.callId)
      .maybeSingle();

    // Only the caller of a live call may trigger a push to the recipient.
    if (!call || call.caller_id !== context.userId) {
      throw new Error("You cannot send alerts for this call.");
    }
    const recentSosCall = Boolean(
      call.sos_session_id &&
      call.status === "ended" &&
      new Date(call.created_at ?? 0).getTime() >= Date.now() - 30_000,
    );
    if (!["initiating", "ringing", "connecting"].includes(call.status) && !recentSosCall) {
      return { delivered: 0, devices: 0 };
    }

    let invitation: { id: string } | null = null;
    if (call.sos_session_id) {
      const { data, error } = await context.supabase
        .from("emergency_call_invitations")
        .upsert({
          emergency_id: call.sos_session_id,
          call_session_id: call.id,
          recipient_user_id: call.recipient_id,
          status: "SENT",
          sent_at: new Date().toISOString(),
        }, { onConflict: "call_session_id,recipient_user_id" })
        .select("id")
        .single();
      if (error || !data) throw new Error("Unable to create the emergency call invitation.");
      invitation = data;
    }

    const publicKey = process.env["VAPID_PUBLIC_KEY"];
    const privateKey = process.env["VAPID_PRIVATE_KEY"];
    const subject = process.env["VAPID_SUBJECT"] ?? "mailto:safety@allma.app";
    if (!publicKey || !privateKey) {
      if (invitation) {
        await context.supabase
          .from("emergency_call_invitations")
          .update({ status: "FAILED" })
          .eq("id", invitation.id);
      }
      console.error("[push] VAPID keys are not configured");
      throw new Error("Background notifications are not configured for this deployment.");
    }

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const callerName = profile?.full_name?.trim() || "An Allma member";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: devices } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("user_id", call.recipient_id);

    if (!devices?.length) {
      if (invitation) {
        await context.supabase
          .from("emergency_call_invitations")
          .update({ status: "FAILED" })
          .eq("id", invitation.id);
      }
      console.warn("[push] recipient has no registered devices", { recipientId: call.recipient_id });
      return { delivered: 0, devices: 0, ...(invitation ? { invitationId: invitation.id } : {}) };
    }

    const { buildPushPayload } = await import("@block65/webcrypto-web-push");
    const vapid = { subject, publicKey, privateKey };
    const message = {
      data: JSON.stringify({
        type: "incoming_emergency_call",
        callId: call.id,
        ...(invitation ? { invitationId: invitation.id } : {}),
        title: call.sos_session_id
          ? `${callerName.split(" ")[0]} is in danger`
          : "Incoming Allma call",
        body: call.sos_session_id
          ? `${callerName} activated SOS and is calling you on Allma. Please answer.`
          : `${callerName} is calling you on Allma.`,
      }),
      options: { ttl: 60, urgency: "high" as const },
    };

    let delivered = 0;
    const stale: string[] = [];

    await Promise.all(
      devices.map(async (device) => {
        try {
          const payload = await buildPushPayload(
            message,
            {
              endpoint: device.endpoint,
              expirationTime: null,
              keys: { p256dh: device.p256dh, auth: device.auth_key },
            },
            vapid,
          );
          const response = await fetch(device.endpoint, {
            ...payload,
            body: payload.body as unknown as BodyInit,
          });
          if (response.status === 404 || response.status === 410) {
            stale.push(device.id);
            return;
          }
          if (response.ok) delivered += 1;
        } catch (cause) {
          console.error("[push] delivery failed", cause);
        }
      }),
    );

    if (stale.length) {
      await supabaseAdmin.from("push_subscriptions").delete().in("id", stale);
    }

    if (invitation) {
      await context.supabase
        .from("emergency_call_invitations")
        .update({
          status: delivered ? "DELIVERED" : "FAILED",
          delivered_at: delivered ? new Date().toISOString() : null,
        })
        .eq("id", invitation.id);
    }
    return { delivered, devices: devices.length, ...(invitation ? { invitationId: invitation.id } : {}) };
  });

export const sendTestPushAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const publicKey = process.env["VAPID_PUBLIC_KEY"];
    const privateKey = process.env["VAPID_PRIVATE_KEY"];
    const subject = process.env["VAPID_SUBJECT"] ?? "mailto:safety@allma.app";
    if (!publicKey || !privateKey) throw new Error("Push delivery is not configured.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: devices } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("user_id", context.userId);
    if (!devices?.length) return { delivered: 0, devices: 0 };

    const { buildPushPayload } = await import("@block65/webcrypto-web-push");
    let delivered = 0;
    const stale: string[] = [];
    await Promise.all(devices.map(async (device) => {
      try {
        const payload = await buildPushPayload(
          {
            data: JSON.stringify({
              type: "allma_test_alert",
              title: "Allma test alert",
              body: "Background alerts are working on this device.",
            }),
            options: { ttl: 60, urgency: "high" as const },
          },
          { endpoint: device.endpoint, expirationTime: null, keys: { p256dh: device.p256dh, auth: device.auth_key } },
          { subject, publicKey, privateKey },
        );
        const response = await fetch(device.endpoint, { ...payload, body: payload.body as unknown as BodyInit });
        if (response.status === 404 || response.status === 410) stale.push(device.id);
        else if (response.ok) delivered += 1;
      } catch (error) {
        console.error("[push] test alert failed", error);
      }
    }));
    if (stale.length) await supabaseAdmin.from("push_subscriptions").delete().in("id", stale);
    return { delivered, devices: devices.length };
  });

export const notifySosActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { activityId: string }) => {
    if (!input || typeof input.activityId !== "string" || !UUID.test(input.activityId)) {
      throw new Error("A valid SOS activity id is required.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: activity, error: activityError } = await context.supabase
      .from("safety_activity")
      .select("id, user_id, location_text, details")
      .eq("id", data.activityId)
      .eq("user_id", context.userId)
      .eq("activity_type", "sos_activated")
      .maybeSingle();
    if (activityError || !activity) throw new Error("SOS activity could not be found.");

    const { data: connections, error: connectionsError } = await context.supabase.rpc("list_safety_connections");
    if (connectionsError) throw new Error("Safety Network members could not be loaded.");
    const recipientIds = Array.from(new Set(
      ((connections ?? []) as Array<{ member_id?: string; notify_on_sos?: boolean }>)
        .filter((connection) => connection.member_id && connection.notify_on_sos !== false)
        .map((connection) => connection.member_id!),
    ));
    if (!recipientIds.length) return { delivered: 0, devices: 0, recipients: 0 };

    const publicKey = process.env["VAPID_PUBLIC_KEY"];
    const privateKey = process.env["VAPID_PRIVATE_KEY"];
    if (!publicKey || !privateKey) throw new Error("Background notifications are not configured for this deployment.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await context.supabase.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    const callerName = profile?.full_name?.trim() || "An Allma member";
    const location = activity.location_text && activity.location_text !== "Location pending"
      ? ` Location: ${activity.location_text}.`
      : " Location details will follow when available.";
    const { data: devices } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth_key")
      .in("user_id", recipientIds);
    if (!devices?.length) return { delivered: 0, devices: 0, recipients: recipientIds.length };

    const { buildPushPayload } = await import("@block65/webcrypto-web-push");
    const stale: string[] = [];
    let delivered = 0;
    await Promise.all(devices.map(async (device) => {
      try {
        const payload = await buildPushPayload(
          {
            data: JSON.stringify({ type: "sos_activity", activityId: activity.id, title: `${callerName} activated SOS`, body: `${callerName} needs help on Allma.${location}` }),
            options: { ttl: 120, urgency: "high" as const },
          },
          { endpoint: device.endpoint, expirationTime: null, keys: { p256dh: device.p256dh, auth: device.auth_key } },
          { subject: process.env["VAPID_SUBJECT"] ?? "mailto:safety@allma.app", publicKey, privateKey },
        );
        const response = await fetch(device.endpoint, { ...payload, body: payload.body as unknown as BodyInit });
        if (response.status === 404 || response.status === 410) stale.push(device.id);
        else if (response.ok) delivered += 1;
      } catch (error) {
        console.error("[push] SOS activity delivery failed", { recipientId: device.user_id, error });
      }
    }));
    if (stale.length) await supabaseAdmin.from("push_subscriptions").delete().in("id", stale);
    console.info("[push] SOS activity delivery", { activityId: activity.id, recipients: recipientIds.length, devices: devices.length, delivered });
    return { delivered, devices: devices.length, recipients: recipientIds.length };
  });
