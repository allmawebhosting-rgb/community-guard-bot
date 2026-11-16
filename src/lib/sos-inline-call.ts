import { useSyncExternalStore } from "react";

export type SosInlineCall = {
  activityId: string;
  callId: string;
  name: string;
  avatarUrl?: string | null;
  safetyRole?: string;
  status: "connecting" | "connected";
  seconds: number;
  muted: boolean;
  speaker: boolean;
};

type SosInlineCallActions = {
  toggleMute: () => void;
  toggleSpeaker: () => void;
  hangUp: () => void | Promise<void>;
};

let snapshot: SosInlineCall | null = null;
let actions: SosInlineCallActions | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function setSosInlineCall(call: SosInlineCall | null) {
  snapshot = call;
  notify();
}

export function updateSosInlineCall(patch: Partial<SosInlineCall>) {
  if (!snapshot) return;
  snapshot = { ...snapshot, ...patch };
  notify();
}

export function setSosInlineCallActions(next: SosInlineCallActions | null) {
  actions = next;
}

export function runSosInlineCallAction(action: keyof SosInlineCallActions) {
  return actions?.[action]();
}

export function subscribeSosInlineCall(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSosInlineCall() {
  return useSyncExternalStore(
    subscribeSosInlineCall,
    () => snapshot,
    () => null,
  );
}
