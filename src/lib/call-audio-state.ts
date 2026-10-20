import { useSyncExternalStore } from "react";

export type CallAudioPhase = "idle" | "outgoing" | "incoming" | "active" | "ended";
let blocked = false;
let revision = 0;
const listeners = new Set<() => void>();

export function setCallAudioPhase(phase: CallAudioPhase) {
  const next = phase === "outgoing" || phase === "incoming" || phase === "active";
  if (next === blocked) return;
  blocked = next;
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function isCallAudioBlocked() { return blocked; }
export function callAudioRevision() { return revision; }
export function subscribeCallAudio(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useCallAudioBlocked() {
  return useSyncExternalStore(subscribeCallAudio, isCallAudioBlocked, () => false);
}