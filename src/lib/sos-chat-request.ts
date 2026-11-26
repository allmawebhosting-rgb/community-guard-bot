/** Header / floating SOS button asks the open chat to start SOS in-place. */
const KEY = "allma:sos-chat-start";
export const SOS_CHAT_START_TTL_MS = 45_000;

export function markSosChatStart(now = Date.now()) {
  try {
    sessionStorage.setItem(KEY, String(now));
  } catch {
    /* ignore */
  }
}

export function peekSosChatStart(now = Date.now()): boolean {
  try {
    const stamp = Number(sessionStorage.getItem(KEY));
    return Number.isFinite(stamp) && stamp > 0 && now - stamp >= 0 && now - stamp <= SOS_CHAT_START_TTL_MS;
  } catch {
    return false;
  }
}

export function consumeSosChatStart(now = Date.now()): boolean {
  try {
    const stamp = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    const at = Number(stamp);
    return Number.isFinite(at) && at > 0 && now - at >= 0 && now - at <= SOS_CHAT_START_TTL_MS;
  } catch {
    return false;
  }
}

export const SOS_CHAT_START_EVENT = "allma:sos-chat-start";

/**
 * Ask a chat that is already open on this page to start SOS in place.
 * Returns true when a mounted chat took the request, so the caller must not navigate away.
 */
export function requestSosChatStartInPlace(): boolean {
  if (typeof window === "undefined") return false;
  const detail = { handled: false };
  window.dispatchEvent(new CustomEvent(SOS_CHAT_START_EVENT, { detail }));
  return detail.handled;
}
