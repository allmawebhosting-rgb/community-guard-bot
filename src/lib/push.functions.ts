import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  claimPushIdempotency,
  dispatchWebPush,
  insertInAppNotification,
  vapidConfig,
} from "@/lib/push-dispatch.server";

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
    // A browser endpoint belongs to the device, not permanently to an account.
    // Authentication above fixes the new owner; only this exact validated
    // endpoint is reassigned atomically, without weakening owner-only RLS.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
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
    // Soft unlink for this account only — do not destroy the browser subscription
    // so a later sign-in can re-associate the same endpoint.
    await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", context.userId)
      .eq("endpoint", data.endpoint);
    return { ok: true };
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ensureCallInvitation(
  supabase: { from: (...args: never[]) => any },
  admin: { from: (...args: never[]) => any },
  args: {
    sosSessionId: string;
    callId: string;
    recipientUserId: string;
  },
): Promise<{ id: string } | null> {
  const payload = {
    emergency_id: args.sosSessionId,
    call_session_id: args.callId,
    recipient_user_id: args.recipientUserId,
    status: "SENT",
    sent_at: new Date().toISOString(),
  };
  try {
    const { data, error } = await (supabase as any)
      .from("emergency_call_invitations")
      .upsert(payload, { onConflict: "call_session_id,recipient_user_id" })
      .select("id")
      .single();
    if (!error && data?.id) return data;
  } catch {
    /* fall through */
  }
  try {
    const { data, error } = await (admin as any)
      .from("emergency_call_invitations")
      .upsert(payload, { onConflict: "call_session_id,recipient_user_id" })
      .select("id")
      .single();
    if (!error && data?.id) return data;
    console.warn("[push] invitation upsert failed", error);
  } catch (error) {
    console.warn("[push] invitation upsert threw", error);
  }
  return null;
}

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
    if (!call || call.caller_id !== context.userId || !call.recipient_id) {
      throw new Error("You cannot send alerts for this call.");
    }
    const recentSosCall = Boolean(
      call.sos_session_id &&
        call.status === "ended" &&
        new Date(call.created_at ?? 0).getTime() >= Date.now() - 30_000,
    );
    if (!["initiating", "ringing", "connecting"].includes(call.status) && !recentSosCall) {
      return { delivered: 0, devices: 0, stage: "call_not_ringing" as const };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let invitation: { id: string } | null = null;
    if (call.sos_session_id) {
      // Invitation must not block push — realtime/in-app can still ring without it.
      invitation = await ensureCallInvitation(context.supabase as never, supabaseAdmin as never, {
        sosSessionId: call.sos_session_id,
        callId: call.id,
        recipientUserId: call.recipient_id,
      });
    }

    const idempotencyKey = `incoming_call:${call.id}:${call.recipient_id}`;
    const proceed = await claimPushIdempotency(supabaseAdmin, {
      idempotencyKey,
      kind: "incoming_emergency_call",
      recipientUserId: call.recipient_id,
      eventId: call.id,
    });
    if (!proceed) {
      return {
        delivered: 0,
        devices: 0,
        stage: "skipped_duplicate" as const,
        ...(invitation ? { invitationId: invitation.id } : {}),
      };
    }

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const callerName = profile?.full_name?.trim() || "An Allma member";
    const title = call.sos_session_id
      ? `${callerName.split(" ")[0]} is in danger`
      : "Incoming Allma call";
    const body = call.sos_session_id
      ? `${callerName} activated SOS and is calling you on Allma. Please answer.`
      : `${callerName} is calling you on Allma.`;
    const link = invitation
      ? `/calls?invitation=${invitation.id}&call=${call.id}`
      : `/calls?call=${call.id}`;

    await insertInAppNotification(supabaseAdmin, {
      userId: call.recipient_id,
      title,
      body,
      kind: call.sos_session_id ? "sos_emergency_call" : "incoming_call",
      link,
      idempotencyKey: `inbox:${idempotencyKey}`,
    });

    const { data: devices } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("user_id", call.recipient_id);

    const push = await dispatchWebPush({
      admin: supabaseAdmin,
      devices: devices ?? [],
      recipientUserId: call.recipient_id,
      kind: "incoming_emergency_call",
      eventId: call.id,
      idempotencyKey,
      ttlSeconds: 60,
      payload: {
        type: "incoming_emergency_call",
        callId: call.id,
        ...(invitation ? { invitationId: invitation.id } : {}),
        ...(call.sos_session_id ? { activityId: call.sos_session_id } : {}),
        title,
        body,
      },
    });

    if (invitation && push.delivered > 0) {
      await context.supabase
        .from("emergency_call_invitations")
        .update({
          status: "DELIVERED",
          delivered_at: new Date().toISOString(),
        })
        .eq("id", invitation.id)
        .then(({ error }) => {
          if (error) console.warn("[push] invitation DELIVERED update failed", error);
        });
    }

    return {
      delivered: push.delivered,
      devices: push.devices,
      stage: push.stage,
      ...(invitation ? { invitationId: invitation.id } : {}),
    };
  });

export const sendTestPushAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!vapidConfig().ready) throw new Error("Push delivery is not configured.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: devices } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("user_id", context.userId);
    const idempotencyKey = `test:${context.userId}:${Math.floor(Date.now() / 60_000)}`;
    const push = await dispatchWebPush({
      admin: supabaseAdmin,
      devices: devices ?? [],
      recipientUserId: context.userId,
      kind: "allma_test_alert",
      eventId: context.userId,
      idempotencyKey,
      ttlSeconds: 60,
      payload: {
        type: "allma_test_alert",
        title: "Allma test alert",
        body: "Background alerts are working on this device.",
      },
    });
    return { delivered: push.delivered, devices: push.devices, stage: push.stage };
  });

export const notifySosActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { activityId: string; status?: "activated" | "resolved" }) => {
    if (!input || typeof input.activityId !== "string" || !UUID.test(input.activityId)) {
      throw new Error("A valid SOS activity id is required.");
    }
    if (input.status !== undefined && input.status !== "activated" && input.status !== "resolved") {
      throw new Error("A valid SOS notification status is required.");
    }
    return { ...input, status: input.status ?? "activated" };
  })
  .handler(async ({ data, context }) => {
    const resolved = data.status === "resolved";
    const { data: activity, error: activityError } = await (context.supabase as any)
      .from("safety_activity")
      .select("id, user_id, location_text, details, activity_type, thread_id")
      .eq("id", data.activityId)
      .eq("user_id", context.userId)
      .eq("activity_type", resolved ? "sos_resolved" : "sos_activated")
      .maybeSingle();
    if (activityError || !activity) throw new Error("SOS activity could not be found.");

    const { data: connections, error: connectionsError } = await context.supabase.rpc(
      "list_safety_connections",
    );
    if (connectionsError) throw new Error("Safety Network members could not be loaded.");
    const recipientIds = Array.from(
      new Set(
        ((connections ?? []) as Array<{ member_id?: string; notify_on_sos?: boolean }>)
          .filter((connection) => connection.member_id && connection.notify_on_sos !== false)
          .map((connection) => connection.member_id!),
      ),
    );
    if (!recipientIds.length) {
      return { delivered: 0, devices: 0, recipients: 0, stage: "no_recipients" as const };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const callerName = profile?.full_name?.trim() || "An Allma member";
    const title = resolved ? `${callerName} is safe` : `${callerName} activated SOS`;
    const body = resolved
      ? `${callerName} marked themselves safe. Their SOS has ended.`
      : `${callerName} needs help on Allma.${
          activity.location_text && activity.location_text !== "Location pending"
            ? " Location was shared with authorised contacts."
            : " Location details will follow when available."
        }`;
    const threadId =
      (activity as { thread_id?: string | null }).thread_id ||
      (typeof activity.details === "object" &&
      activity.details &&
      "thread_id" in activity.details
        ? String((activity.details as { thread_id?: unknown }).thread_id ?? "")
        : "") ||
      null;
    const link = threadId
      ? `/chat/${threadId}`
      : `/calls?room=${encodeURIComponent(activity.id)}`;

    const { data: devices } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth_key")
      .in("user_id", recipientIds);

    let delivered = 0;
    let deviceCount = 0;
    for (const recipientId of recipientIds) {
      const idempotencyKey = `sos_activity:${activity.id}:${data.status}:${recipientId}`;
      const proceed = await claimPushIdempotency(supabaseAdmin, {
        idempotencyKey,
        kind: resolved ? "sos_resolved" : "sos_activated",
        recipientUserId: recipientId,
        eventId: activity.id,
      });
      if (!proceed) continue;

      await insertInAppNotification(supabaseAdmin, {
        userId: recipientId,
        title,
        body,
        kind: resolved ? "sos_resolved" : "sos_activated",
        link,
        idempotencyKey: `inbox:${idempotencyKey}`,
      });

      const recipientDevices = (devices ?? []).filter((device) => device.user_id === recipientId);
      deviceCount += recipientDevices.length;
      const push = await dispatchWebPush({
        admin: supabaseAdmin,
        devices: recipientDevices,
        recipientUserId: recipientId,
        kind: resolved ? "sos_resolved" : "sos_activated",
        eventId: activity.id,
        idempotencyKey,
        ttlSeconds: 120,
        payload: {
          type: "sos_activity",
          activityId: activity.id,
          ...(threadId ? { threadId } : {}),
          status: data.status,
          title,
          body,
        },
      });
      delivered += push.delivered;
    }

    console.info("[push] SOS activity delivery", {
      activityId: activity.id,
      recipients: recipientIds.length,
      devices: deviceCount,
      delivered,
      vapid: vapidConfig().ready,
    });
    return {
      delivered,
      devices: deviceCount,
      recipients: recipientIds.length,
      stage: delivered > 0 ? ("provider_accepted" as const) : ("failed" as const),
    };
  });

/** Notify the SOS owner that an authorised responder joined the shared conversation. */
export const notifyResponderJoined = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { activityId: string; callId?: string | null }) => {
    if (!input || typeof input.activityId !== "string" || !UUID.test(input.activityId)) {
      throw new Error("A valid SOS activity id is required.");
    }
    if (input.callId != null && (typeof input.callId !== "string" || !UUID.test(input.callId))) {
      throw new Error("A valid call id is required.");
    }
    return { activityId: input.activityId, callId: input.callId ?? null };
  })
  .handler(async ({ data, context }) => {
    const { data: activity, error } = await (context.supabase as any)
      .from("safety_activity")
      .select("id, user_id, thread_id, details")
      .eq("id", data.activityId)
      .maybeSingle();
    if (error || !activity?.user_id) throw new Error("Emergency case could not be found.");
    if (activity.user_id === context.userId) {
      return { delivered: 0, devices: 0, stage: "self" as const };
    }

    // Caller must be an authorised participant (accepted invitation after claim).
    const { data: invitation } = await context.supabase
      .from("emergency_call_invitations")
      .select("id, status")
      .eq("emergency_id", data.activityId)
      .eq("recipient_user_id", context.userId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const status = String(invitation?.status ?? "").toUpperCase();
    if (!invitation || status !== "ACCEPTED") {
      throw new Error("You are not authorised for this emergency.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: joiner } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const joinerName = joiner?.full_name?.trim() || "A Safety Network responder";
    const title = "Responder joined your emergency";
    const body = `${joinerName} has joined the conversation and can communicate with you.`;
    const threadId =
      activity.thread_id ||
      (typeof activity.details === "object" &&
      activity.details &&
      "thread_id" in activity.details
        ? String((activity.details as { thread_id?: unknown }).thread_id ?? "")
        : "") ||
      null;
    const link = threadId ? `/chat/${threadId}` : `/calls?room=${encodeURIComponent(activity.id)}`;
    const idempotencyKey = `responder_joined:${activity.id}:${context.userId}`;

    const proceed = await claimPushIdempotency(supabaseAdmin, {
      idempotencyKey,
      kind: "responder_joined",
      recipientUserId: activity.user_id,
      eventId: activity.id,
    });
    if (!proceed) {
      return { delivered: 0, devices: 0, stage: "skipped_duplicate" as const };
    }

    await insertInAppNotification(supabaseAdmin, {
      userId: activity.user_id,
      title,
      body,
      kind: "responder_joined",
      link,
      idempotencyKey: `inbox:${idempotencyKey}`,
    });

    const { data: devices } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("user_id", activity.user_id);

    const push = await dispatchWebPush({
      admin: supabaseAdmin,
      devices: devices ?? [],
      recipientUserId: activity.user_id,
      kind: "responder_joined",
      eventId: activity.id,
      idempotencyKey,
      ttlSeconds: 120,
      payload: {
        type: "responder_joined",
        activityId: activity.id,
        ...(threadId ? { threadId } : {}),
        title,
        body,
      },
    });

    return { delivered: push.delivered, devices: push.devices, stage: push.stage };
  });
