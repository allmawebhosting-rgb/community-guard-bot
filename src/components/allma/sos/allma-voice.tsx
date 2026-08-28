import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { getSosEscalation } from "@/lib/sos-escalation-controller";
import { cn } from "@/lib/utils";

type VoiceStatus = "ready" | "speaking" | "listening" | "quiet";

const ACTIVATION_MESSAGE =
  "Your emergency alert is active. I am contacting your Safety Network now. Try to stay calm. If you can, move to a safer location.";

function guidanceFor(text: string) {
  const value = text.toLowerCase();
  if (/ambulance|medical|injur|bleed|cannot move|can't move/.test(value)) {
    return "I hear you. Keep still if moving could make things worse. I am keeping your emergency active. Call emergency medical services if you can safely do so.";
  }
  if (/fire|smoke|burn/.test(value)) {
    return "Move away from smoke and heat if you can do so safely. Stay low and leave the area. Your emergency remains active.";
  }
  if (/follow|attack|threat|danger|weapon/.test(value)) {
    return "Move toward other people or a staffed public place if you can. Do not confront anyone. Your emergency remains active.";
  }
  return "I hear you. Your emergency is still active. Stay near a safer place and keep your phone available for your Safety Network.";
}

function speak(text: string, onStart?: () => void, onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.92;
  utterance.pitch = 1;
  utterance.onstart = onStart ?? null;
  utterance.onend = onEnd ?? null;
  window.speechSynthesis.speak(utterance);
}

export function AllmaVoice({
  activityId,
  compact = false,
}: {
  activityId: string | null;
  compact?: boolean;
}) {
  const [muted, setMuted] = useState(false);
  const [message, setMessage] = useState(ACTIVATION_MESSAGE);
  const [status, setStatus] = useState<VoiceStatus>("ready");
  const [responderConnected, setResponderConnected] = useState(false);
  const greeted = useRef(false);

  const handleTranscript = useCallback((text: string) => {
    setMessage(text);
    const response = guidanceFor(text);
    setMessage(response);
    if (!muted && !responderConnected) {
      speak(response, () => setStatus("speaking"), () => setStatus("ready"));
    }
  }, [muted, responderConnected]);

  const handleError = useCallback((error: string) => toast.error(error), []);
  const voiceInput = useVoiceInput({ onTranscript: handleTranscript, onError: handleError });

  useEffect(() => {
    if (!activityId) return;
    const controller = getSosEscalation(activityId, "other");
    const sync = () => {
      const connected = Boolean(controller.state.answered);
      setResponderConnected(connected);
      if (connected) {
        window.speechSynthesis?.cancel();
        setStatus("quiet");
        setMessage("Allma will stay available quietly while you speak.");
      }
    };
    sync();
    return controller.subscribe(sync);
  }, [activityId]);

  useEffect(() => {
    if (greeted.current || muted || responderConnected) return;
    greeted.current = true;
    setMessage(ACTIVATION_MESSAGE);
    speak(ACTIVATION_MESSAGE, () => setStatus("speaking"), () => setStatus("ready"));
    return () => window.speechSynthesis?.cancel();
  }, [muted, responderConnected]);

  useEffect(() => {
    if (!voiceInput.recording) return;
    window.speechSynthesis?.cancel();
    setStatus("listening");
  }, [voiceInput.recording]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (next) {
      window.speechSynthesis?.cancel();
      setStatus(responderConnected ? "quiet" : "ready");
    }
  };

  const statusLabel = responderConnected
    ? "QUIET MODE"
    : voiceInput.recording
      ? "LISTENING"
      : status === "speaking"
        ? "SPEAKING"
        : "READY";

  return (
    <section
      aria-labelledby="allma-voice-heading"
      className={cn(
        "border-b border-white/[0.08] py-5",
        compact ? "" : "rounded-2xl border border-white/[0.1] bg-white/[0.035] px-4",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p id="allma-voice-heading" className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">
            Allma Voice
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-300">
            <span className={cn("h-1.5 w-1.5 rounded-full", responderConnected ? "bg-white/50" : "bg-emerald-300 animate-pulse")} />
            {statusLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute Allma Voice" : "Mute Allma Voice"}
          className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-white/65 transition hover:bg-white/10 hover:text-white"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-white/80">{message}</p>
      <div className="mt-4 flex h-8 items-center gap-1.5" aria-hidden="true">
        {Array.from({ length: 18 }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "w-1 rounded-full bg-emerald-300/70 transition-all",
              status === "speaking" || voiceInput.recording ? "animate-pulse" : "h-1.5",
            )}
            style={{ height: `${8 + ((index * 13) % 20)}px`, animationDelay: `${index * 45}ms` }}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMessage("Type an update in the emergency update panel below, or speak when you are ready.")}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-[11px] font-bold text-white/75 transition hover:bg-white/10"
        >
          <MessageSquare className="h-3.5 w-3.5" /> Text
        </button>
        <button
          type="button"
          onPointerDown={() => void voiceInput.start()}
          onPointerUp={() => void voiceInput.stop()}
          onPointerCancel={voiceInput.cancel}
          disabled={responderConnected || voiceInput.transcribing}
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 text-[11px] font-black text-[#101214] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {voiceInput.recording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          {voiceInput.transcribing ? "Processing..." : voiceInput.recording ? "Release to send" : "Hold or tap to speak"}
        </button>
      </div>
    </section>
  );
}
