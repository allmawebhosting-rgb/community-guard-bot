// A real in-app tap records a short-lived intent; /sos?instant=true only
// auto-starts when this intent exists, so reloads, history and shared links
// never start a new SOS.
const KEY = "allma:sos-intent";
export const SOS_INTENT_TTL_MS = 15_000;

export function markSosIntent(now = Date.now()) {
  try { sessionStorage.setItem(KEY, String(now)); } catch { /* ignore */ }
}

export function isSosIntentFresh(stamp: string | null, now = Date.now()) {
  const at = Number(stamp);
  return Number.isFinite(at) && at > 0 && now - at >= 0 && now - at <= SOS_INTENT_TTL_MS;
}

export function consumeSosIntent(now = Date.now()) {
  try {
    const stamp = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return isSosIntentFresh(stamp, now);
  } catch {
    return false;
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<{ value: T; timedOut: boolean }> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ value: fallback, timedOut: true }), ms);
    promise.then(
      (value) => { clearTimeout(t); resolve({ value, timedOut: false }); },
      () => { clearTimeout(t); resolve({ value: fallback, timedOut: false }); },
    );
  });
}
