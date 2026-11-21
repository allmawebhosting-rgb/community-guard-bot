import {
  getPushConfig,
  savePushSubscription,
  deletePushSubscription,
} from "./push.functions";

export type PushState =
  | "unsupported"
  | "ios-needs-install"
  | "not-configured"
  | "denied"
  | "prompt"
  | "enabled";

function isIos() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1)
  );
}

/** iOS only delivers web push to apps added to the home screen. */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** Reports what background call alerts can actually do on this device, without asking for permission. */
export async function readPushState(): Promise<PushState> {
  if (!pushSupported()) {
    return isIos() && !isStandalone() ? "ios-needs-install" : "unsupported";
  }
  if (isIos() && !isStandalone()) return "ios-needs-install";

  const config = await getPushConfig().catch(() => null);
  if (!config?.publicKey) return "not-configured";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "prompt";

  try {
    const existing = await (await registration()).pushManager.getSubscription();
    return existing ? "enabled" : "prompt";
  } catch {
    return "prompt";
  }
}

/** Asks for permission if needed, then registers this device for incoming-call pushes. */
export async function enableBackgroundCallAlerts(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? "ios-needs-install" : "unsupported";
  if (isIos() && !isStandalone()) return "ios-needs-install";

  const config = await getPushConfig().catch(() => null);
  if (!config?.publicKey) return "not-configured";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "prompt";

  const reg = await registration();
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    }));

  const json = subscription.toJSON();
  if (!json.keys?.["p256dh"] || !json.keys?.["auth"] || !json.endpoint) return "prompt";

  await savePushSubscription({
    data: {
      endpoint: json.endpoint,
      p256dh: json.keys["p256dh"],
      auth: json.keys["auth"],
      userAgent: navigator.userAgent,
    },
  });

  return "enabled";
}

/** Repairs a granted browser subscription without showing a permission prompt. */
export async function ensurePushRegistered(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? "ios-needs-install" : "unsupported";
  if (isIos() && !isStandalone()) return "ios-needs-install";
  if (Notification.permission !== "granted") return readPushState();

  const config = await getPushConfig().catch(() => null);
  if (!config?.publicKey) return "not-configured";
  const reg = await registration();
  // Permission already granted: recreate a missing PushManager subscription so
  // Safety Network SOS alerts keep working after browser data clears.
  let subscription = await reg.pushManager.getSubscription();
  try {
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });
    }
  } catch (error) {
    console.warn("[ALLMA PUSH] subscribe failed", error);
    return "prompt";
  }
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return "prompt";
  try {
    await savePushSubscription({
      data: {
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent,
      },
    });
  } catch (error) {
    console.warn("[ALLMA PUSH] save subscription failed", error);
    return "prompt";
  }
  return "enabled";
}

/** Keep registration fresh when the tab becomes visible again after sign-in. */
export function startPushRegistrationHeartbeat() {
  if (typeof window === "undefined") return () => undefined;
  let last = 0;
  const tick = () => {
    const now = Date.now();
    if (now - last < 60_000) return;
    last = now;
    void ensurePushRegistered().catch(() => undefined);
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") tick();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", tick);
  tick();
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", tick);
  };
}

export async function disableBackgroundCallAlerts() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const subscription = await reg?.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => undefined);
  await deletePushSubscription({ data: { endpoint } }).catch(() => undefined);
}
