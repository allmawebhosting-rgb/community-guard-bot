import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { setCallAudioPhase } from "@/lib/call-audio-state";

const mocks = vi.hoisted(() => ({ start: vi.fn(), cancel: vi.fn(), navigate: vi.fn(), transcript: null as null | ((text: string) => void) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate, useRouterState: () => "/" }));
vi.mock("@/hooks/useVoiceInput", () => ({ useVoiceInput: (options: { onTranscript: (text: string) => void }) => {
  mocks.transcript = options.onTranscript;
  return { start: mocks.start, cancel: mocks.cancel, stop: vi.fn(), recording: false, transcribing: false, level: 0 };
} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }) } } }));
vi.mock("@/lib/onboarding", () => ({ fetchOnboardingState: vi.fn() }));
vi.mock("@/components/allma/mascot", () => ({ Mascot: () => null, MascotAvatar: () => null }));
import { VoiceAssistant } from "./voice-assistant";

afterEach(() => { cleanup(); setCallAudioPhase("idle"); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("releases the microphone during ringing and resumes after a call ends", async () => {
  const cancelSpeech = vi.fn();
  vi.stubGlobal("speechSynthesis", { cancel: cancelSpeech, speak: vi.fn() });
  vi.stubGlobal("SpeechSynthesisUtterance", class {});
  render(<VoiceAssistant />);
  act(() => window.dispatchEvent(new CustomEvent("allma:voice-mode-set", { detail: "on" })));
  // Intro may be waiting for auth; call still synchronously cancels it.
  act(() => setCallAudioPhase("incoming"));
  expect(mocks.cancel).toHaveBeenCalled();
  expect(cancelSpeech).toHaveBeenCalled();
  mocks.start.mockClear();
  act(() => setCallAudioPhase("active"));
  expect(mocks.start).not.toHaveBeenCalled();
  act(() => setCallAudioPhase("ended"));
  expect(mocks.start).toHaveBeenCalledOnce();
});
it("discards a pending reply and navigation even if the call has already ended", async () => {
  let finish: ((value: unknown) => void) | undefined;
  const fetchMock = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  const speak = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("speechSynthesis", { cancel: vi.fn(), speak });
  render(<VoiceAssistant />);
  await act(async () => { mocks.transcript?.("Find a hospital"); });
  expect(fetchMock).toHaveBeenCalledOnce();
  act(() => setCallAudioPhase("incoming"));
  act(() => setCallAudioPhase("ended"));
  await act(async () => finish?.({ ok: true, json: async () => ({ text: "Here you go", actions: [{ type: "navigate", to: "/nearby" }] }) }));
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(speak).not.toHaveBeenCalled();
});