import type { SupabaseClient } from "@supabase/supabase-js";

export type PushDispatchDevice = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  user_id?: string;
};

export type PushDispatchResult = {
  delivered: number;
  devices: number;
  stage:
    | "provider_accepted"
    | "provider_rejected"
    | "no_devices"
    | "failed"
    | "skipped_duplicate"
    | "not_configured";
  staleRemoved: number;
};

function vapidConfig() {
  const publicKey = process.env["VAPID_PUBLIC_KEY"] ?? null;
  const privateKey = process.env["VAPID_PRIVATE_KEY"] ?? null;
  const subject = process.env["VAPID_SUBJECT"] ?? "mailto:safety@allma.app";
  return { publicKey, privateKey, subject, ready: Boolean(publicKey && privateKey) };
}

async function recordAttempt(
  admin: SupabaseClient,
  args: {
    idempotencyKey: string;
    kind: string;
    recipientUserId: string;
    eventId?: string | null;
    stage: string;
    devicesTargeted?: number;
    devicesAccepted?: number;
    errorCode?: string | null;
    detail?: string | null;
  },
) {
  try {
    await (admin as any).from("notification_delivery_attempts").upsert(
      {
        idempotency_key: args.idempotencyKey,
        kind: args.kind,
        recipient_user_id: args.recipientUserId,
        event_id: args.eventId ?? null,
        stage: args.stage,
        provider: "web_push",
        devices_targeted: args.devicesTargeted ?? 0,
        devices_accepted: args.devicesAccepted ?? 0,
        error_code: args.errorCode?.slice(0, 64) ?? null,
        detail: args.detail?.slice(0, 280) ?? null,
      },
      { onConflict: "idempotency_key" },
    );
  } catch (error) {
    console.warn("[push] delivery audit write failed", error);
  }
}

/** Claim an idempotency key; returns false if a successful send already happened. */
export async function claimPushIdempotency(
  admin: SupabaseClient,
  args: {
    idempotencyKey: string;
    kind: string;
    recipientUserId: string;
    eventId?: string | null;
  },
): Promise<boolean> {
  try {
    const { data: existing } = await (admin as any)
      .from("notification_delivery_attempts")
      .select("stage, created_at")
      .eq("idempotency_key", args.idempotencyKey)
      .maybeSingle();
    const ageMs = existing
      ? Date.now() - new Date(existing.created_at).getTime()
      : Number.POSITIVE_INFINITY;
    // Only skip true provider successes. Allow a later retry after no_devices once
    // the recipient registers a token (common after first SOS).
    if (existing?.stage === "provider_accepted" && ageMs < 5 * 60_000) {
      await recordAttempt(admin, {
        ...args,
        stage: "skipped_duplicate",
        detail: `prior=${existing.stage}`,
      });
      return false;
    }
    if (existing?.stage === "no_devices" && ageMs < 45_000) {
      await recordAttempt(admin, {
        ...args,
        stage: "skipped_duplicate",
        detail: `prior=${existing.stage}`,
      });
      return false;
    }
    await recordAttempt(admin, { ...args, stage: "queued" });
    return true;
  } catch {
    return true;
  }
}

export async function insertInAppNotification(
  admin: SupabaseClient,
  args: {
    userId: string;
    title: string;
    body: string;
    kind: string;
    link: string | null;
    idempotencyKey: string;
  },
) {
  const row = {
    user_id: args.userId,
    title: args.title.slice(0, 160),
    body: args.body.slice(0, 400),
    kind: args.kind,
    link: args.link,
    idempotency_key: args.idempotencyKey,
    is_read: false,
  };
  const { error } = await (admin as any).from("notifications").insert(row);
  if (!error) return;
  // Unique idempotency hit = already recorded.
  if (String(error.code) === "23505") return;
  // Older schemas without idempotency_key.
  if (/idempotency_key/i.test(String(error.message ?? ""))) {
    const fallback = await (admin as any).from("notifications").insert({
      user_id: args.userId,
      title: row.title,
      body: row.body,
      kind: args.kind,
      link: args.link,
      is_read: false,
    });
    if (fallback.error) console.warn("[push] in-app notification insert failed", fallback.error);
    return;
  }
  console.warn("[push] in-app notification insert failed", error);
}

/**
 * Dispatch Web Push to one or more devices. Cleans 404/410 tokens.
 * Provider acceptance ≠ person saw the notification.
 */
export async function dispatchWebPush(args: {
  admin: SupabaseClient;
  devices: PushDispatchDevice[];
  recipientUserId: string;
  kind: string;
  eventId?: string | null;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  ttlSeconds?: number;
}): Promise<PushDispatchResult> {
  const vapid = vapidConfig();
  if (!vapid.ready || !vapid.publicKey || !vapid.privateKey) {
    await recordAttempt(args.admin, {
      idempotencyKey: args.idempotencyKey,
      kind: args.kind,
      recipientUserId: args.recipientUserId,
      eventId: args.eventId,
      stage: "failed",
      errorCode: "vapid_missing",
      detail: "Web Push VAPID keys are not configured",
    });
    return {
      delivered: 0,
      devices: args.devices.length,
      stage: "not_configured",
      staleRemoved: 0,
    };
  }

  if (!args.devices.length) {
    await recordAttempt(args.admin, {
      idempotencyKey: args.idempotencyKey,
      kind: args.kind,
      recipientUserId: args.recipientUserId,
      eventId: args.eventId,
      stage: "no_devices",
      detail: "Recipient has no registered push subscriptions",
    });
    return { delivered: 0, devices: 0, stage: "no_devices", staleRemoved: 0 };
  }

  const { buildPushPayload } = await import("@block65/webcrypto-web-push");
  const stale: string[] = [];
  let delivered = 0;

  await Promise.all(
    args.devices.map(async (device) => {
      try {
        const payload = await buildPushPayload(
          {
            data: JSON.stringify(args.payload),
            options: {
              ttl: args.ttlSeconds ?? 90,
              urgency: "high" as const,
            },
          },
          {
            endpoint: device.endpoint,
            expirationTime: null,
            keys: { p256dh: device.p256dh, auth: device.auth_key },
          },
          {
            subject: vapid.subject,
            publicKey: vapid.publicKey!,
            privateKey: vapid.privateKey!,
          },
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
      } catch (error) {
        console.error("[push] device delivery failed", {
          deviceId: device.id,
          error,
        });
      }
    }),
  );

  if (stale.length) {
    await args.admin.from("push_subscriptions").delete().in("id", stale);
  }

  const stage =
    delivered > 0
      ? ("provider_accepted" as const)
      : stale.length === args.devices.length
        ? ("provider_rejected" as const)
        : ("failed" as const);

  await recordAttempt(args.admin, {
    idempotencyKey: args.idempotencyKey,
    kind: args.kind,
    recipientUserId: args.recipientUserId,
    eventId: args.eventId,
    stage,
    devicesTargeted: args.devices.length,
    devicesAccepted: delivered,
    errorCode: delivered > 0 ? null : stage,
    detail: `stale=${stale.length}`,
  });

  return {
    delivered,
    devices: args.devices.length,
    stage,
    staleRemoved: stale.length,
  };
}

export { vapidConfig };
