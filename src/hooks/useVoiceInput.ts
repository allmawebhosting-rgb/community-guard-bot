import { useCallback, useRef, useState } from "react";

type Recorder = {
  stream: MediaStream;
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  chunks: Float32Array[];
};

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
}: {
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}) {
  const recorder = useRef<Recorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const start = useCallback(async () => {
    if (recorder.current) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError("Microphone access is needed to record.");
      return;
    }

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    processor.onaudioprocess = (event) => {
      chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    source.connect(processor);
    processor.connect(ctx.destination);

    recorder.current = { stream, ctx, source, processor, chunks };
    setRecording(true);
  }, [onError]);

  const stop = useCallback(async () => {
    const active = recorder.current;
    if (!active) return;
    recorder.current = null;
    setRecording(false);

    active.stream.getTracks().forEach((track) => track.stop());
    active.processor.disconnect();
    active.source.disconnect();
    const blob = encodeWav(active.chunks, active.ctx.sampleRate);
    await active.ctx.close();

    if (blob.size < 4096) {
      onError("That recording was empty — please try again.");
      return;
    }

    setTranscribing(true);
    try {
      const form = new FormData();
      form.append("audio", blob, "recording.wav");
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      if (!response.ok) {
        onError((await response.text().catch(() => "")) || "Could not transcribe that recording.");
        return;
      }
      const data = (await response.json()) as { text?: string };
      if (data.text?.trim()) onTranscript(data.text.trim());
      else onError("No speech was detected.");
    } catch {
      onError("Could not transcribe that recording.");
    } finally {
      setTranscribing(false);
    }
  }, [onError, onTranscript]);

  const toggle = useCallback(() => {
    if (recording) void stop();
    else void start();
  }, [recording, start, stop]);

  return { recording, transcribing, toggle };
}
