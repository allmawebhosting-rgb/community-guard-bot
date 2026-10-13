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

  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const lastSpokeRef = useRef(Date.now());
  const announce = useCallback((text: string) => {
    setMessage(text);
    lastSpokeRef.current = Date.now();
    if (mutedRef.current) return;
    speak(text, () => setStatus("speaking"), () => setStatus("ready"));
  }, []);

  // Narrate the real escalation as it happens — every line maps to controller state.
  useEffect(() => {
    if (!activityId) return;
    const controller = getSosEscalation(activityId, "other");
    let prev = { priority: -1, round: 0, answered: false, noTargets: false, failed: 0, wait: false };
    const roleName = (p: number) => (p === 1 ? "primary" : p === 2 ? "backup" : "additional");
    const sync = () => {
      const s = controller.state;
      const connected = Boolean(s.answered);
      setResponderConnected(connected);
      if (connected && !prev.answered) {
        const name = s.answered?.full_name || "Your contact";
        announce(`${name} has answered and is on the line with you. I will stay quiet so you can talk.`);
        prev.answered = true;
        return;
      }
      if (connected) return;
      if (s.noTargets && !prev.noTargets) {
        prev.noTargets = true;
        announce("You have no reachable Safety Network contacts right now. Your alert is still active. If you are in danger, call Police on 999 or Emergency on 112.");
      }
      if (s.priority > 0 && s.priority !== prev.priority) {
        const names = s.targets
          .filter((t) => !t.ineligible_reason && Math.min(Math.max(t.priority || 3, 1), 3) === s.priority)
          .map((t) => t.full_name)
          .slice(0, 3);
        const who = names.length ? names.join(" and ") : `your ${roleName(s.priority)} contacts`;
        const lead = prev.priority > 0 ? `No answer yet. Moving to your ${roleName(s.priority)} contacts. ` : "";
        announce(`${lead}I am calling ${who} now. Stay with me, help from your network is being reached.`);
      }
      const waiting = s.priority === 0 && s.round > 0 && s.waitSeconds != null;
      if (waiting && !prev.wait) {
        announce(`Nobody has answered yet, but I am not giving up. I will call everyone again in ${s.waitSeconds} seconds. Your alert and location stay active.`);
      }
      const failed = s.attempts.filter((a) => ["missed", "declined", "rejected", "unanswered"].includes(a.status)).length;
      prev = { ...prev, priority: s.priority, round: s.round, failed, wait: waiting };
    };
    sync();
    return controller.subscribe(sync);
  }, [activityId, announce]);

  useEffect(() => {
    if (responderConnected) {
      window.speechSynthesis?.cancel();
      setStatus("quiet");
    }
  }, [responderConnected]);

  useEffect(() => {
    if (greeted.current || muted || responderConnected) return;
    greeted.current = true;
    announce(ACTIVATION_MESSAGE);
  }, [muted, responderConnected, announce]);

  // Gentle reassurance while waiting, so the person never feels alone.
  useEffect(() => {
    if (responderConnected) return;
    const lines = [
      "I am still here with you. Your emergency is active and your Safety Network is being called.",
      "Take a slow breath in, and out. Keep your phone close. I am staying with you.",
      "If you can, move toward people or a safe, lit place. Your location is being shared with your contacts.",
      "You are doing well. Keep listening for your phone. If you are in immediate danger, call 999 or 112.",
    ];
    let i = 0;
    const id = setInterval(() => {
      if (voiceInput.recording || window.speechSynthesis?.speaking) return;
      if (Date.now() - lastSpokeRef.current < 25_000) return;
      announce(lines[i++ % lines.length]);
    }, 5_000);
    return () => clearInterval(id);
  }, [responderConnected, announce, voiceInput.recording]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

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
        "border-b border-border/60 py-5",
        compact ? "" : "rounded-2xl border border-border/60 bg-card px-4",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p id="allma-voice-heading" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Allma Voice
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-success">
            <span className={cn("h-1.5 w-1.5 rounded-full", responderConnected ? "bg-muted-foreground" : "bg-success animate-pulse")} />
            {statusLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute Allma Voice" : "Mute Allma Voice"}
          className="grid h-9 w-9 place-items-center rounded-xl border border-border/70 text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>

      <p className="mt-4 rounded-xl border border-border/50 bg-muted/30 p-3 text-[13px] leading-relaxed text-foreground/80">{message}</p>
      <div className="mt-4 flex h-8 items-center justify-center gap-1.5" aria-hidden="true">
        {Array.from({ length: 18 }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "w-1 rounded-full bg-success/70 transition-all",
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
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/70 px-3 text-[11px] font-bold text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <MessageSquare className="h-3.5 w-3.5" /> Text
        </button>
        <button
          type="button"
          onPointerDown={() => void voiceInput.start()}
          onPointerUp={() => void voiceInput.stop()}
          onPointerCancel={voiceInput.cancel}
          disabled={responderConnected || voiceInput.transcribing}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-[11px] font-black text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {voiceInput.recording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          {voiceInput.transcribing ? "Processing..." : voiceInput.recording ? "Release to send" : "Hold or tap to speak"}
        </button>
      </div>
    </section>
  );
}
