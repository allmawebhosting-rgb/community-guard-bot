import { useSyncExternalStore } from "react";

/** The in-chat SOS that is currently active on this device (real safety_activity row). */
export type ActiveSos = {
  activityId: string;
  type: string;
  /** True once GPS has been captured and shared for this SOS. */
  locationShared?: boolean;
};

let current: ActiveSos | null = null;
const listeners = new Set<() => void>();

function sameSos(a: ActiveSos | null, b: ActiveSos | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.activityId === b.activityId &&
    a.type === b.type &&
    Boolean(a.locationShared) === Boolean(b.locationShared)
  );
}

export function setActiveSos(next: ActiveSos | null) {
  if (sameSos(current, next)) return;
  current = next;
  listeners.forEach((l) => l());
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
