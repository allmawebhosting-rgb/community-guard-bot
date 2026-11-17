import { useSyncExternalStore } from "react";

/** The in-chat SOS that is currently active on this device (real safety_activity row). */
export type ActiveSos = { activityId: string; type: string };

let current: ActiveSos | null = null;
const listeners = new Set<() => void>();

export function setActiveSos(next: ActiveSos | null) {
  if (current?.activityId === next?.activityId && current?.type === next?.type) return;
  current = next;
  listeners.forEach((l) => l());
}

export function useActiveSos() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => current,
    () => null,
  );
}
