import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Keyboard, Mic, MicOff, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { Button } from "@/components/ui/button";
import { Mascot, MascotAvatar } from "@/components/allma/mascot";
import { QUICK_ACTIONS } from "@/lib/allma";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { fetchOnboardingState } from "@/lib/onboarding";

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
  const [intro, setIntro] = useState(false);
  const [shown, setShown] = useState(0);
  const [docked, setDocked] = useState(false); // voice stays on, page visible
  const introRunRef = useRef(0);
  const skipIntro = () => {
    introRunRef.current++;
    setIntro(false);
    setShown(QUICK_ACTIONS.length);
  };
  const turnsRef = useRef<Turn[]>([]);
  const activeRef = useRef(false);
  activeRef.current = active;
  const listenRef = useRef<() => void>(() => {});
  const stopLoopRef = useRef<(exit?: boolean) => void>(() => {});

  const paused = path.startsWith("/sos") || path.startsWith("/police");

  // Ask every time the app is opened.
  useEffect(() => {
    setPref(null);
  }, []);

  // Broadcast the current mode and accept switches from header / profile.
  const voiceOn = pref === "on" && active;
  useEffect(() => {
    const send = () => window.dispatchEvent(new CustomEvent("allma:voice-mode-state", { detail: voiceOn ? "on" : "off" }));
    send();
    window.addEventListener("allma:voice-mode-query", send);
    return () => window.removeEventListener("allma:voice-mode-query", send);
  }, [voiceOn]);
  useEffect(() => {
    const h = (e: Event) => {
      const m = (e as CustomEvent<"on" | "off">).detail;
      if (m === "on") startLoopRef.current(true);
      else { introRunRef.current++; setIntro(false); stopLoopRef.current(true); }
    };
    window.addEventListener("allma:voice-mode-set", h);
    return () => window.removeEventListener("allma:voice-mode-set", h);
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
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        const res = await fetch("/api/voice-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ messages: next, path }),
        });
        if (!res.ok) throw new Error((await res.text()) || "Allma could not answer.");
        const data = (await res.json()) as {
          text: string;
          actions?: { type: string; to?: string }[];
          onboardingChanged?: boolean;
        };
        const reply = data.text.replace(/\[\[(NAV|ACTION):[^\]]*\]\]/g, "").trim();
        turnsRef.current = [...turnsRef.current, { role: "assistant", content: reply }];
        setReply(reply);
        if (data.onboardingChanged) window.dispatchEvent(new Event("allma:onboarding-sync"));
        let exit = false;
        for (const a of data.actions ?? []) {
          if (a.type === "navigate" && a.to) {
            introRunRef.current++;
            setIntro(false);
            setDocked(true);
            void navigate({ to: a.to as "/" });
          }
          if (a.type === "back") window.history.back();
          if (a.type === "request_location") navigator.geolocation?.getCurrentPosition(() => {}, () => {});
          if (a.type === "sos") {
            stopLoopRef.current();
            void navigate({ to: "/sos", search: { instant: 1 } as never });
            return;
          }
          if (a.type === "exit") exit = true;
        }
        if (exit) {
          speak(reply || "Okay, closing voice mode.", () => {});
          stopLoopRef.current(true);
          return;
        }
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
      if (/Microphone/i.test(m)) setHint("Allow microphone access, or use Tap to speak.");
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

  const runIntro = () => {
    setIntro(true);
    setShown(0);
    const lines = [
      "Hello, I'm Allma, your AI safety companion for Uganda. Here is what I can do for you.",
      ...QUICK_ACTIONS.map((a) => `${a.label}. ${a.description}.`),
      "Just tell me what you need.",
    ];
    let i = 0;
    const run = ++introRunRef.current;
    const next = () => {
      if (!activeRef.current || run !== introRunRef.current) return;
      if (i >= lines.length) {
        setIntro(false);
        setSpeaking(false);
        listenRef.current();
        return;
      }
      const idx = i++;
      if (idx >= 1 && idx <= QUICK_ACTIONS.length) setShown(idx);
      setSpeaking(true);
      speak(lines[idx], next);
    };
    next();
  };

  const startLoop = (withIntro = false) => {
    localStorage.setItem(PREF_KEY, "on");
    setPref("on");
    setActive(true);
    activeRef.current = true;
    setHint("");
    // Unlock speech output inside the tap so later replies can be heard on phones.
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis?.speak(u);
    } catch {
      /* ignore */
    }
    if (withIntro) {
      // Ask for the microphone inside the tap, then talk through the intro.
      void navigator.mediaDevices
        ?.getUserMedia({ audio: true })
        .then((s) => s.getTracks().forEach((t) => t.stop()))
        .catch(() => {});
      turnsRef.current = [{ role: "assistant", content: GREETING }];
      void (async () => {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          const st = await fetchOnboardingState(data.user.id);
          if (!st.completed) {
            setDocked(true);
            void navigate({ to: "/onboarding" });
            void ask("Hi Allma, please guide me through setting up my account by voice.");
            return;
          }
        }
        runIntro();
      })();
      return;
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

  const stopLoop = (exitMode = false) => {
    if (exitMode) {
      localStorage.setItem(PREF_KEY, "off");
      setPref("off");
    }
    setActive(false);
    activeRef.current = false;
    voice.cancel();
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setDocked(false);
  };

  stopLoopRef.current = stopLoop;

  const decline = () => {
    localStorage.setItem(PREF_KEY, "off");
    setPref("off");
  };

  if (pref === "unknown" || paused) return null;

  // First visit: choose a mode.
  if (pref === null) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Choose how to use Allma" className="fixed inset-0 z-[70] grid place-items-center bg-background/80 p-4 backdrop-blur-md animate-in fade-in duration-300">
        <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-2xl">
          <MascotAvatar className="mx-auto size-20" />
          <p className="mt-4 text-xl font-bold">How would you like to use Allma?</p>
          <p className="mt-2 text-sm text-muted-foreground">Talk to Allma hands-free, or use the app by typing and tapping. You can switch any time.</p>
          <div className="mt-5 grid gap-2">
            <Button size="lg" onClick={() => startLoop(true)}><Mic className="size-4" /> Use voice</Button>
            <Button size="lg" variant="outline" onClick={decline}><Keyboard className="size-4" /> Text only</Button>
          </div>
        </div>
      </div>
    );
  }

  // Standard mode: only a launcher button.
  if (pref === "off" || !active) {
    return (
      <button
        type="button"
        data-allma-voice-dot
        aria-label="Start Allma voice mode"
        onClick={() => startLoop(false)}
        className="fixed bottom-20 right-4 z-[60] grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-105 md:bottom-6"
      >
        <Mic className="size-5" />
      </button>
    );
  }

  // Voice mode: full-screen takeover.
  const busy = voice.transcribing || thinking;
  const status = voice.recording
    ? voice.level > 0.08 ? "Listening…" : "Speak now"
    : voice.transcribing ? "Understanding…" : thinking ? "Thinking…" : speaking ? "Speaking…" : "Ready";
  const scale = 1 + (voice.recording ? voice.level * 0.6 : speaking ? 0.12 : 0);

  // Docked: page stays visible and usable, Allma keeps listening and talking.
  if (docked) {
    return (
      <div
        data-allma-voice-dot
        role="region"
        aria-label="Allma voice assistant"
        className="fixed inset-x-3 bottom-20 z-[60] mx-auto max-w-md rounded-3xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300 md:bottom-6"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Expand Allma voice"
            onClick={() => setDocked(false)}
            className="relative grid size-12 shrink-0 place-items-center"
          >
            <span
              className={cn("absolute inset-0 rounded-full bg-gradient-to-br from-primary via-gold to-destructive opacity-60 transition-transform duration-150", (busy || speaking) && "animate-pulse")}
              style={{ transform: `scale(${scale})` }}
            />
            <MascotAvatar className="relative size-10" />
          </button>
          <div className="min-w-0 flex-1" aria-live="polite">
            <p className="text-xs font-semibold text-muted-foreground">{status}</p>
            <p className="line-clamp-2 text-sm">{hint || reply || heard || "Just speak — I'm here."}</p>
          </div>
          {voice.recording ? (
            <Button size="icon" aria-label="Done speaking" onClick={() => void voice.stop()}><Send className="size-4" /></Button>
          ) : (
            <Button size="icon" variant="outline" aria-label="Tap to speak" disabled={busy} onClick={() => { window.speechSynthesis?.cancel(); setSpeaking(false); void voice.start(); }}>
              <Mic className="size-4" />
            </Button>
          )}
          <Button size="icon" variant="ghost" aria-label="Stop voice" onClick={() => stopLoop(false)}><X className="size-4" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-allma-voice-dot
      role="dialog"
      aria-modal="true"
      aria-label="Allma voice mode"
      className="fixed inset-0 z-[70] flex flex-col bg-background text-foreground animate-in fade-in duration-300"
    >
      <div className="flex items-center justify-between px-4 pb-2" style={{ paddingTop: "max(env(safe-area-inset-top), 3rem)" }}>
        <div className="flex items-center gap-2">
          <MascotAvatar />
          <div className="leading-tight">
            <p className="text-sm font-semibold">Allma Voice</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground"><span className="size-2 animate-pulse rounded-full bg-success" /> Online</p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => { skipIntro(); stopLoop(true); }}>
          <X className="size-4" /> Text mode
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center gap-5 overflow-y-auto px-6 py-4 text-center">
        <div className="relative mt-2 grid size-44 shrink-0 place-items-center">
          <span className={cn("absolute inset-0 rounded-full bg-primary/20 blur-2xl", (busy || speaking) && "animate-pulse")} />
          <span
            className="absolute inset-3 rounded-full bg-gradient-to-br from-primary via-gold to-destructive opacity-70 transition-transform duration-150"
            style={{ transform: `scale(${scale})` }}
          />
          <span className={cn("absolute inset-7 rounded-full bg-background/70", busy && "animate-ping")} />
          <Mascot size={110} priority className="relative" />
        </div>
        <p className="text-2xl font-semibold" aria-live="polite">{intro ? "Hello, I'm Allma" : status}</p>
        {(intro || shown > 0) && !heard && (
          <ul className="grid w-full max-w-md gap-2 text-left">
            {QUICK_ACTIONS.slice(0, shown).map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => { skipIntro(); void ask(a.prompt); }}
                  className="flex w-full items-center gap-3 rounded-2xl text-left border border-border bg-card p-3 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500"
                >
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl text-xl", a.iconColor)} aria-hidden>{a.emoji}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{a.label}</span>
                    <span className="block text-xs text-muted-foreground">{a.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="max-w-xl space-y-3">
          {heard && <p className="text-base text-muted-foreground">"{heard}"</p>}
          {reply && <p className="text-lg leading-relaxed">{reply}</p>}
          {hint && <p className="text-sm text-destructive">{hint}</p>}
        </div>
      </div>

      <div className="flex justify-center gap-3 p-6 pb-10">
        {voice.recording ? (
          <Button size="lg" onClick={() => void voice.stop()}><Send className="size-4" /> Done speaking</Button>
        ) : (
          <Button size="lg" variant="outline" disabled={busy} onClick={() => { skipIntro(); window.speechSynthesis?.cancel(); setSpeaking(false); void voice.start(); }}>
            <Mic className="size-4" /> Tap to speak
          </Button>
        )}
        <Button size="lg" variant="ghost" onClick={() => { skipIntro(); stopLoop(false); }}><MicOff className="size-4" /> Minimise</Button>
      </div>
    </div>
  );
}
