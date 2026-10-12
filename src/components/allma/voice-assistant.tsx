import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Mic, MicOff, Send, Volume2, X } from "lucide-react";
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
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(fallback);
    onEnd();
  };
  // Some phones never fire onend — fall back on an estimate of speaking time.
  const fallback = setTimeout(finish, 2500 + text.length * 75);
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.97;
  u.onend = finish;
  u.onerror = finish;
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
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [hint, setHint] = useState("");
  const [open, setOpen] = useState(true);
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
      setHeard(text);
      setReply("");
      setHint("");
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
        setReply(reply);
        if (nav?.[1]) void navigate({ to: nav[1] as "/" });
        say(reply);
      } catch (e) {
        const m = e instanceof Error ? e.message : "Allma could not answer.";
        setHint(m);
        toast.error(m);
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
      setHint(QUIET_ERRORS.test(m) ? "I didn't catch that — please speak again, a little closer." : m);
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

  // Phones only allow the microphone/audio after a tap, so resume the
  // hands-free loop on the first tap anywhere when voice was left on.
  useEffect(() => {
    if (pref !== "on" || active || paused) return;
    const resume = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("[data-allma-voice-dot]")) return;
      startLoopRef.current();
    };
    window.addEventListener("pointerdown", resume, { once: true });
    return () => window.removeEventListener("pointerdown", resume);
  }, [pref, active, paused]);

  const startLoop = () => {
    localStorage.setItem(PREF_KEY, "on");
    setPref("on");
    setActive(true);
    activeRef.current = true;
    setOpen(true);
    setHint("");
    // Unlock speech output inside the tap so later replies can be heard on phones.
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis?.speak(u);
    } catch {
      /* ignore */
    }
    // Start the microphone right inside the tap — phones block it otherwise.
    if (!turnsRef.current.length) {
      turnsRef.current = [{ role: "assistant", content: GREETING }];
      toast.success("Allma is listening — just speak.");
    }
    void voice.start();
  };

  const startLoopRef = useRef(startLoop);
  startLoopRef.current = startLoop;

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

  const bars = Array.from({ length: 14 });
  if (!open) {
    return (
      <button
        type="button"
        data-allma-voice-dot
        aria-label={label}
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-[60] grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl"
      >
        <Mic className={cn("size-5", active && voice.recording && "animate-pulse")} />
      </button>
    );
  }
  const status = !active ? "Paused" : voice.recording ? "Listening…" : voice.transcribing ? "Understanding…" : thinking ? "Thinking…" : speaking ? "Speaking…" : "Ready";
  return (
    <div
      data-allma-voice-dot
      role="region"
      aria-label="Allma voice assistant"
      className="fixed inset-x-3 bottom-4 z-[60] mx-auto max-w-sm rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl sm:inset-x-auto sm:right-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full", active ? "bg-success animate-pulse" : "bg-muted-foreground/50")} />
          <p className="text-sm font-semibold">Allma Voice</p>
          <span className="text-xs text-muted-foreground" aria-live="polite">{status}</span>
        </div>
        <button type="button" aria-label="Minimise voice assistant" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 flex h-8 items-end justify-center gap-1" aria-hidden="true">
        {bars.map((_, i) => (
          <span
            key={i}
            className={cn("w-1.5 rounded-full transition-all duration-100", voice.recording ? "bg-primary" : busy || speaking ? "bg-accent animate-pulse" : "bg-muted")}
            style={{ height: `${voice.recording ? 4 + voice.level * 28 * (0.5 + ((i * 7) % 5) / 8) : 6}px` }}
          />
        ))}
      </div>
      {heard && <p className="mt-3 text-xs text-muted-foreground">You: <span className="text-foreground">{heard}</span></p>}
      {reply && <p className="mt-2 rounded-xl bg-muted/50 p-2.5 text-sm leading-relaxed">{reply}</p>}
      {hint && <p className="mt-2 text-xs text-destructive">{hint}</p>}
      {!heard && !reply && !hint && (
        <p className="mt-3 text-xs text-muted-foreground">{active ? "Speak now — I'll answer when you stop talking." : "Tap Start and ask anything about your safety."}</p>
      )}
      <div className="mt-3 flex gap-2">
        {active ? (
          <>
            {voice.recording && (
              <Button size="sm" className="flex-1" onClick={() => void voice.stop()}>
                <Send className="size-4" /> Done speaking
              </Button>
            )}
            <Button size="sm" variant="outline" className={cn(!voice.recording && "flex-1")} onClick={stopLoop}>
              <MicOff className="size-4" /> Pause
            </Button>
          </>
        ) : (
          <Button size="sm" className="flex-1" onClick={startLoop}>
            <Mic className="size-4" /> Start voice
          </Button>
        )}
      </div>
    </div>
  );
}
