import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useVoiceInput } from "./useVoiceInput";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
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