import { useCallback, useEffect, useRef, useState } from "react";

type Recorder = {
  stream: MediaStream;
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  analyser: AnalyserNode;
  chunks: Float32Array[];
  raf: number | null;
  timeout: ReturnType<typeof setTimeout> | null;
  interval: ReturnType<typeof setInterval> | null;
};

const MAX_SECONDS = 120;

function encodeWav(chunks: Float32Array[], sampleRate: number, targetRate = 16000) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const ratio = sampleRate / targetRate;
  const length = Math.floor(merged.length / ratio);
  const samples = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const value = merged[Math.floor(i * ratio)] ?? 0;
    const clamped = Math.max(-1, Math.min(1, value));
    samples[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (pos: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(pos + i, text.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);
  new Int16Array(buffer, 44).set(samples);

  return new Blob([buffer], { type: "audio/wav" });
}

export function useVoiceInput({
  onTranscript,
  onError,
  autoStop = false,
  onIdle,
}: {
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
  /** Automatically stop and transcribe when the speaker goes quiet. */
  autoStop?: boolean;
  /** Called when auto mode heard no speech and quietly gave up. */
  onIdle?: () => void;
}) {
  const recorder = useRef<Recorder | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const generation = useRef(0);
  const starting = useRef(false);
  const transcription = useRef<AbortController | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);

  const teardown = useCallback((active: Recorder) => {
    if (active.raf !== null) cancelAnimationFrame(active.raf);
    if (active.timeout) clearTimeout(active.timeout);
    if (active.interval) clearInterval(active.interval);
    active.stream.getTracks().forEach((track) => track.stop());
    active.processor.disconnect();
    active.source.disconnect();
    active.analyser.disconnect();
  }, []);

  const start = useCallback(async () => {
    if (recorder.current || starting.current || transcription.current) return;
    starting.current = true;
    const run = generation.current;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (run === generation.current) onError("Microphone access is needed to record.");
      return;
    } finally {
      starting.current = false;
    }
    if (run !== generation.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const ctx = new AudioContext();
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    if (run !== generation.current) {
      stream.getTracks().forEach((track) => track.stop());
      void ctx.close();
      return;
    }
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const chunks: Float32Array[] = [];
    processor.onaudioprocess = (event) => {
      chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    source.connect(analyser);
    source.connect(processor);
    processor.connect(ctx.destination);

    const active: Recorder = {
      stream,
      ctx,
      source,
      processor,
      analyser,
      chunks,
      raf: null,
      timeout: null,
      interval: null,
    };
    recorder.current = active;

    const buffer = new Uint8Array(analyser.fftSize);
    const startedAt = performance.now();
    let spoke = false;
    let loudFrames = 0;
    let lastLoud = startedAt;
    let noise = 0.015;
    let smooth = 0;
    const tick = () => {
      if (recorder.current !== active) return;
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const v = ((buffer[i] ?? 128) - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buffer.length);
      const peak = rms * 2.2;
      smooth = smooth * 0.6 + Math.min(1, peak * 2.4) * 0.4;
      setLevel(smooth);
      if (autoStop) {
        const now = performance.now();
        const threshold = Math.min(0.1, Math.max(0.025, noise * 2.2));
        // Learn background noise only from quiet frames, so speaking early never raises it.
        if (peak <= threshold) noise = noise * 0.97 + Math.min(peak, 0.08) * 0.03;
        if (peak > threshold) {
          loudFrames += 1; // cumulative — short dips no longer reset speech detection
          if (loudFrames > 5) spoke = true;
          lastLoud = now;
        }
        if (spoke && now - lastLoud > 950) {
          void stopRef.current?.();
          return;
        }
        if (!spoke && now - startedAt > 10000) {
          // Some sound but never clearly "speech": transcribe anyway instead of discarding.
          if (loudFrames > 0) void stopRef.current?.();
          else {
            cancelRef.current?.();
            onIdle?.();
          }
          return;
        }
      }
      active.raf = requestAnimationFrame(tick);
    };
    active.raf = requestAnimationFrame(tick);

    setSeconds(0);
    active.interval = setInterval(() => setSeconds((value) => value + 1), 1000);
    active.timeout = setTimeout(() => {
      void stopRef.current?.();
    }, MAX_SECONDS * 1000);

    setRecording(true);
  }, [onError, autoStop, onIdle]);

  const stop = useCallback(async () => {
    const active = recorder.current;
    if (!active) return;
    const run = generation.current;
    recorder.current = null;
    setRecording(false);
    setLevel(0);

    teardown(active);
    const blob = encodeWav(active.chunks, active.ctx.sampleRate);
    await active.ctx.close();
    if (run !== generation.current) return;

    if (blob.size < 4096) {
      onError("That recording was empty — please try again.");
      return;
    }

    setTranscribing(true);
    const request = new AbortController();
    transcription.current = request;
    try {
      const form = new FormData();
      form.append("audio", blob, "recording.wav");
      const response = await fetch("/api/transcribe", { method: "POST", body: form, signal: request.signal });
      if (run !== generation.current) return;
      if (!response.ok) {
        onError((await response.text().catch(() => "")) || "Could not transcribe that recording.");
        return;
      }
      const data = (await response.json()) as { text?: string };
      if (run !== generation.current) return;
      if (data.text?.trim()) onTranscript(data.text.trim());
      else onError("No speech was detected.");
    } catch {
      if (run === generation.current) onError("Could not transcribe that recording.");
    } finally {
      if (transcription.current === request) {
        transcription.current = null;
        setTranscribing(false);
      }
    }
  }, [onError, onTranscript, teardown]);

  const stopRef = useRef<(() => Promise<void>) | null>(null);
  stopRef.current = stop;

  const cancel = useCallback(() => {
    generation.current += 1;
    transcription.current?.abort();
    transcription.current = null;
    setTranscribing(false);
    const active = recorder.current;
    if (!active) return;
    recorder.current = null;
    setRecording(false);
    setLevel(0);
    setSeconds(0);
    teardown(active);
    void active.ctx.close();
  }, [teardown]);
  cancelRef.current = cancel;

  useEffect(
    () => () => {
      generation.current += 1;
      transcription.current?.abort();
      const active = recorder.current;
      if (!active) return;
      recorder.current = null;
      teardown(active);
      void active.ctx.close();
    },
    [teardown],
  );

  const toggle = useCallback(() => {
    if (recording) void stop();
    else void start();
  }, [recording, start, stop]);

  return { recording, transcribing, toggle, start, stop, cancel, level, seconds };
}
