import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PREF_KEY = "allma.voice.pref"; // "on" | "off"
const GREETING = "Hello, I'm Allma, your safety assistant. I'm listening — just speak whenever you need me.";

type Turn = { role: "user" | "assistant"; content: string };

function speak(text: string, onEnd: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return onEnd();
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.97;
  u.onend = onEnd;
  u.onerror = onEnd;
  window.speechSynthesis.speak(u);
}

const QUIET_ERRORS = /empty|No speech/i;

/**
 * Hands-free, invisible voice assistant. Listens continuously, sends
 * automatically when the person stops talking, acts and replies aloud,
 * then goes back to listening. Only a tiny status dot is shown.
 */
export function VoiceAssistant() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [pref, setPref] = useState<"on" | "off" | null | "unknown">("unknown");
  const [active, setActive] = useState(false); // hands-free loop running
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const turnsRef = useRef<Turn[]>([]);
  const activeRef = useRef(false);
  activeRef.current = active;
  const listenRef = useRef<() => void>(() => {});

  const paused = path.startsWith("/sos") || path.startsWith("/police");

  useEffect(() => {
    const v = localStorage.getItem(PREF_KEY);
    setPref(v === "on" || v === "off" ? v : null);
  }, []);

  const say = useCallback((text: string) => {
    setSpeaking(true);
    speak(text, () => {
      setSpeaking(false);
      if (activeRef.current) listenRef.current();
    });
  }, []);

  const ask = useCallback(
    async (text: string) => {
      const next = [...turnsRef.current, { role: "user" as const, content: text }].slice(-16);
      turnsRef.current = next;
      setThinking(true);
      try {
        const res = await fetch("/api/voice-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next, path }),
        });
        if (!res.ok) throw new Error((await res.text()) || "Allma could not answer.");
        const data = (await res.json()) as { text: string };
        const nav = data.text.match(/\[\[NAV:(\/[a-z\-]*)\]\]/);
        const reply = data.text.replace(/\[\[NAV:[^\]]*\]\]/g, "").trim();
        turnsRef.current = [...turnsRef.current, { role: "assistant", content: reply }];
        if (nav?.[1]) void navigate({ to: nav[1] as "/" });
        say(reply);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Allma could not answer.");
        if (activeRef.current) listenRef.current();
      } finally {
        setThinking(false);
      }
    },
    [navigate, path, say],
  );

  const voice = useVoiceInput({
    autoStop: true,
    onTranscript: (t) => void ask(t),
    onError: (m) => {
      if (!QUIET_ERRORS.test(m)) toast.error(m);
      if (/Microphone/i.test(m)) setActive(false);
      else if (activeRef.current) setTimeout(() => listenRef.current(), 300);
    },
    onIdle: () => {
      if (activeRef.current) setTimeout(() => listenRef.current(), 200);
    },
  });

  listenRef.current = () => {
    if (!activeRef.current || paused) return;
    void voice.start();
  };

  // Pause on SOS / police screens, resume after.
  useEffect(() => {
    if (paused) {
      voice.cancel();
      window.speechSynthesis?.cancel();
    } else if (active && !voice.recording && !thinking && !speaking) {
      listenRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  const startLoop = () => {
    localStorage.setItem(PREF_KEY, "on");
    setPref("on");
    setActive(true);
    activeRef.current = true;
    if (!turnsRef.current.length) {
      turnsRef.current = [{ role: "assistant", content: GREETING }];
      say(GREETING);
    } else listenRef.current();
  };

  const stopLoop = () => {
    setActive(false);
    activeRef.current = false;
    voice.cancel();
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  };

  const decline = () => {
    localStorage.setItem(PREF_KEY, "off");
    setPref("off");
  };

  if (pref === "unknown" || paused) return null;

  if (pref === null) {
    return (
      <div role="dialog" aria-label="Use voice assistant" className="fixed inset-x-3 bottom-4 z-[60] mx-auto max-w-md rounded-2xl border border-border bg-card p-4 shadow-2xl sm:inset-x-auto sm:right-4">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Volume2 className="size-5" /></div>
          <div className="min-w-0">
            <p className="font-semibold">Would you like to use voice?</p>
            <p className="mt-1 text-sm text-muted-foreground">Just talk — Allma listens, understands when you stop speaking, and helps hands-free.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={startLoop}>Yes, use voice</Button>
              <Button size="sm" variant="ghost" onClick={decline}>Not now</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const busy = voice.transcribing || thinking;
  const label = !active
    ? "Allma voice is paused — tap to start listening"
    : voice.recording
      ? "Allma is listening — tap to pause"
      : busy
        ? "Allma is working"
        : speaking
          ? "Allma is speaking — tap to pause"
          : "Allma voice on — tap to pause";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => (active ? stopLoop() : startLoop())}
      className="fixed bottom-3 right-3 z-[60] grid size-6 place-items-center rounded-full"
    >
      <span className="sr-only" aria-live="polite">{label}</span>
      <span
        className={cn(
          "block size-2.5 rounded-full transition-all duration-300",
          !active && "bg-muted-foreground/40",
          active && voice.recording && "bg-primary",
          active && busy && "animate-pulse bg-accent",
          active && speaking && "bg-primary animate-pulse",
          active && !voice.recording && !busy && !speaking && "bg-primary/50",
        )}
        style={active && voice.recording ? { boxShadow: `0 0 0 ${2 + voice.level * 8}px color-mix(in oklab, var(--primary) 25%, transparent)` } : undefined}
      />
    </button>
  );
}
