import { useSyncExternalStore } from "react";

/** The in-chat SOS that is currently active on this device (real safety_activity row). */
export type ActiveSos = {
  activityId: string;
  type: string;
  /** True once GPS has been captured and shared for this SOS. */
  locationShared?: boolean;
  /** True once the SOS was stopped; the header shows "SOS ended" instead of live call status. */
  ended?: boolean;
  endedAt?: number;
};

let current: ActiveSos | null = null;
const listeners = new Set<() => void>();

function sameSos(a: ActiveSos | null, b: ActiveSos | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.activityId === b.activityId &&
    a.type === b.type &&
    Boolean(a.locationShared) === Boolean(b.locationShared) &&
    Boolean(a.ended) === Boolean(b.ended)
  );
}

export function setActiveSos(next: ActiveSos | null) {
  if (sameSos(current, next)) return;
  current = next;
  listeners.forEach((l) => l());
}

const ENDED_BANNER_MS = 60_000;
let endedTimer: ReturnType<typeof setTimeout> | null = null;

/** Flip the header to "SOS ended" right away (before any network round-trip finishes). */
export function markActiveSosEnded(activityId: string, type: string) {
  if (endedTimer) clearTimeout(endedTimer);
  setActiveSos({ activityId, type, ended: true, endedAt: Date.now() });
  endedTimer = setTimeout(() => {
    if (current?.activityId === activityId && current.ended) setActiveSos(null);
  }, ENDED_BANNER_MS);
}

/** Clear the live header for an SOS unless it already switched to its ended state. */
export function clearActiveSos(activityId: string) {
  if (current?.activityId === activityId && !current.ended) setActiveSos(null);
}

export function useActiveSos() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}
