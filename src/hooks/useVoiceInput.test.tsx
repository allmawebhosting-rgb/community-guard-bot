import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useVoiceInput } from "./useVoiceInput";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("aborts transcription and ignores a late transcript after cancellation", async () => {
  let processAudio: ((event: unknown) => void) | undefined;
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  class Context {
    state = "running";
    sampleRate = 16000;
    destination = {};
    createMediaStreamSource() { return node(); }
    createScriptProcessor() {
      return { ...node(), set onaudioprocess(callback: (event: unknown) => void) { processAudio = callback; } };
    }
    createAnalyser() { return { ...node(), fftSize: 512, getByteTimeDomainData: vi.fn() }; }
    async close() {}
  }
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: vi.fn() }] }) } });
  let finish: ((response: unknown) => void) | undefined;
  const fetchMock = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  vi.stubGlobal("fetch", fetchMock);
  const onTranscript = vi.fn();
  const onError = vi.fn();
  const { result } = renderHook(() => useVoiceInput({ onTranscript, onError }));
  await act(async () => result.current.start());
  processAudio?.({ inputBuffer: { getChannelData: () => new Float32Array(4096) } });
  let pending: Promise<void> | undefined;
  await act(async () => { pending = result.current.stop(); await Promise.resolve(); });
  expect(fetchMock).toHaveBeenCalledOnce();
  const signal = (fetchMock.mock.calls[0] as unknown as [string, { signal: AbortSignal }])[1].signal;
  act(() => result.current.cancel());
  expect(signal.aborted).toBe(true);
  await act(async () => {
    finish?.({ ok: true, json: async () => ({ text: "Call audio must not become a command" }) });
    await pending;
  });
  expect(onTranscript).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
  expect(result.current.transcribing).toBe(false);
});
it("stops a microphone granted after recording was cancelled", async () => {
  let grant: ((stream: MediaStream) => void) | undefined;
  const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve) => { grant = resolve; }));
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  const stopTrack = vi.fn();
  const onTranscript = vi.fn();
  const onError = vi.fn();
  const { result } = renderHook(() => useVoiceInput({ onTranscript, onError }));
  let pending: Promise<void> | undefined;
  act(() => { pending = result.current.start(); });
  act(() => result.current.cancel());
  await act(async () => {
    grant?.({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream);
    await pending;
  });
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(result.current.recording).toBe(false);
  expect(onTranscript).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});