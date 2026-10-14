import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AudioLines, ChevronRight, Flame, Map as MapIcon, ShieldAlert, FileText, Heart, Home, Hospital, Keyboard, Loader2, Lock, LogOut, MapPin, MessageCircle, Mic, Package, RotateCcw, Send, ShieldCheck, Siren, Square, UserRound, X, Zap } from "lucide-react";
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

const BAR_SHAPE = [0.35, 0.6, 0.85, 1, 0.75, 0.95, 0.65, 0.45, 0.8, 0.55, 0.3];

function Waves({ level, animated, small }: { level: number; animated?: boolean; small?: boolean }) {
  return (
    <div className={cn("flex items-center justify-center gap-1", small ? "h-5" : "h-12")} aria-hidden>
      {BAR_SHAPE.slice(0, small ? 5 : BAR_SHAPE.length).map((s, i) => (
        <span
          key={i}
          className={cn("w-1 rounded-full bg-primary transition-[height] duration-100 ease-out", animated && "animate-pulse")}
          style={{ height: `${Math.max(12, Math.min(100, (0.12 + level * 1.6 * s) * 100))}%`, animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

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
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-muted-foreground">{status}</p>
              <Waves small level={voice.recording ? voice.level : speaking ? 0.35 : 0} animated={speaking || busy} />
            </div>
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

  const phase = intro ? "intro" : voice.recording ? "listening" : busy ? "thinking" : speaking ? "speaking" : "ready";
  const headline = { intro: "Hi, I'm Allma 👋", listening: "Listening…", thinking: "One moment…", speaking: "Allma is answering", ready: "Tap to talk" }[phase];
  const sub = { intro: "Here is what I can do for you.", listening: "Talk to me naturally. I'm here to help.", thinking: "Working on it for you…", speaking: "Speak any time to interrupt.", ready: "Tap the microphone and speak." }[phase];
  const tapTalk = () => { skipIntro(); window.speechSynthesis?.cancel(); setSpeaking(false); void voice.start(); };
  const repeat = () => { if (reply) { voice.cancel(); say(reply); } };
  const lvl = voice.recording ? voice.level : speaking ? 0.35 : busy ? 0.15 : 0.04;
  const go = (to: string) => { setDocked(true); void navigate({ to }); };
  const cards = [
    { label: "Find Hospital", sub: "Hospitals & clinics", icon: Hospital, tone: "bg-success/15 text-success", prompt: "Where is the nearest hospital?" },
    { label: "Find Police", sub: "Stations & support", icon: ShieldCheck, tone: "bg-primary/10 text-primary", prompt: "Where is the nearest police station?" },
    { label: "Fire & Ambulance", sub: "Fire & ambulance", icon: Flame, tone: "bg-gold/25 text-foreground", prompt: "Where is the nearest fire station or ambulance service?" },
    { label: "Report Crime", sub: "Report incidents", icon: ShieldAlert, tone: "bg-destructive/10 text-destructive", prompt: "I want to report a crime." },
  ];
  const side = [
    { label: "Ask anything", sub: "Get instant answers", icon: Zap, prompt: "What can you help me with?" },
    { label: "Report an incident", sub: "Share details by voice", icon: MapPin, prompt: "I want to report an incident." },
    { label: "Emergency help", sub: 'Say "emergency"', icon: Siren, prompt: "This is an emergency. I need help right now." },
    { label: "Find & recover", sub: "Lost items & people", icon: UserRound, prompt: "I want to report something lost or found." },
    { label: "Locate hospital", sub: "Nearest facility", icon: Hospital, prompt: "Where is the nearest hospital?" },
  ];
  const nav = [
    { label: "Home", icon: Home, to: "/" }, { label: "Chat", icon: MessageCircle, to: "/chat" },
    { label: "Reports", icon: FileText, to: "/reports" }, { label: "Find Hospital", icon: Hospital, to: "/nearby" },
    { label: "Lost & Found", icon: Package, to: "/lost-found" }, { label: "Profile", icon: UserRound, to: "/profile" },
  ];
  const Bars = ({ dir }: { dir: 1 | -1 }) => (
    <div className={cn("flex h-24 flex-1 items-center gap-[3px]", dir === -1 ? "justify-end" : "justify-start")} aria-hidden>
      {Array.from({ length: 16 }).map((_, k) => {
        const i = dir === -1 ? 15 - k : k;
        const s = Math.sin((i + 1) * 1.7) * 0.5 + 0.5;
        const fade = 1 - i / 18;
        return <span key={k} className={cn("voice-bar w-[3px] rounded-full transition-[height] duration-100", (speaking || busy) && "animate-pulse")} style={{ height: `${Math.max(6, Math.min(100, (0.08 + lvl * 2.2 * s) * 100 * fade))}%`, opacity: 0.35 + fade * 0.65, animationDelay: `${i * 70}ms` }} />;
      })}
    </div>
  );

  return (
    <div data-allma-voice-dot role="dialog" aria-modal="true" aria-label="Allma voice mode"
      className="voice-deck fixed inset-0 z-[70] flex text-foreground animate-in fade-in duration-300">
      {/* Desktop left rail */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card/70 p-4 lg:flex">
        <div className="flex items-center gap-3"><MascotAvatar className="size-12" /><div className="leading-tight"><p className="font-bold">Allma Voice</p><p className="flex items-center gap-1 text-xs text-success"><span className="size-2 rounded-full bg-success" /> Online</p><p className="text-xs text-muted-foreground">Your Safety & Community AI</p></div></div>
        <div className="mt-6 flex items-center gap-3 rounded-xl bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary"><Mic className="size-4" /> Voice Mode</div>
        <nav className="mt-2 grid gap-1">
          {nav.map((n) => <button key={n.label} type="button" onClick={() => go(n.to)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-muted"><n.icon className="size-4" /> {n.label}</button>)}
          <button type="button" onClick={() => { skipIntro(); void ask("This is an emergency. I need help right now."); }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-destructive hover:bg-destructive/10"><Siren className="size-4" /> Emergency SOS</button>
        </nav>
        <div className="mt-auto rounded-2xl bg-muted p-3 text-sm"><Heart className="mb-1 size-5 text-primary" />Together for a safer community<div className="mt-2 flex h-1.5 w-10 overflow-hidden rounded"><span className="flex-1 bg-foreground" /><span className="flex-1 bg-gold" /><span className="flex-1 bg-destructive" /></div></div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 px-4 pb-2 lg:px-8" style={{ paddingTop: "max(env(safe-area-inset-top), 1rem)" }}>
          <div className="flex min-w-0 items-center gap-2.5 lg:invisible">
            <MascotAvatar className="size-11 border-2" />
            <div className="min-w-0 leading-tight"><p className="truncate font-bold">Allma Voice</p><p className="flex items-center gap-1 text-xs text-success"><span className="size-2 animate-pulse rounded-full bg-success" /> Online</p><p className="truncate text-xs text-muted-foreground">Your Safety & Community AI</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="voice-card inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-primary"><Mic className="size-3.5" /> {voice.recording ? "Voice Active" : "Voice Mode"}<span className={cn("size-2 rounded-full", voice.recording ? "bg-success animate-pulse" : "bg-muted-foreground")} /></span>
            <Button size="icon" variant="outline" className="rounded-xl" aria-label="Switch to text mode" onClick={() => { skipIntro(); stopLoop(true); }}><Keyboard className="size-5" /></Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col items-center gap-3 overflow-y-auto overscroll-contain px-4 text-center lg:justify-center lg:gap-4 lg:pb-6" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1rem)" }}>
            <MascotAvatar className="hidden size-28 lg:block" />
            <div className="hidden lg:block">
              <h2 className={cn("text-3xl font-bold tracking-tight lg:text-5xl", phase === "listening" && "voice-title")}>{headline}</h2>
              <p className="mt-1 text-muted-foreground">{sub}</p>
            </div>

            <div className="flex w-full max-w-3xl items-center gap-2 pt-1 lg:gap-3">
              <Bars dir={-1} />
              <button type="button" aria-label={voice.recording ? "Done speaking" : "Tap to talk"} disabled={busy}
                onClick={() => (voice.recording ? void voice.stop() : tapTalk())}
                className="voice-orb grid size-28 shrink-0 place-items-center rounded-full text-primary-foreground transition-transform duration-100 ease-out active:scale-95 sm:size-32 lg:size-44"
                style={{ transform: `scale(${scale})` }}>
                {busy ? <Loader2 className="size-10 animate-spin lg:size-12" /> : <Mic className="size-11 lg:size-14" />}
              </button>
              <Bars dir={1} />
            </div>

            <div className="voice-card w-full max-w-xs rounded-2xl px-4 py-2" aria-live="polite">
              <p className={cn("flex items-center justify-center gap-2 text-base font-bold",
                phase === "listening" ? "text-success" : phase === "thinking" ? "text-foreground" : phase === "speaking" ? "text-primary" : "text-foreground")}>
                <span className={cn("size-2.5 rounded-full", phase === "listening" ? "bg-success animate-pulse" : phase === "thinking" ? "bg-gold animate-pulse" : phase === "speaking" ? "bg-primary animate-pulse" : "bg-muted-foreground")} />
                {hint ? "Something went wrong" : { intro: "Introducing…", listening: "I'm listening…", thinking: "Processing…", speaking: "Speaking…", ready: "Ready" }[phase]}
              </p>
              <p className="text-xs text-muted-foreground">{hint ? hint : phase === "ready" ? "Tap the mic to talk." : "Speak naturally — I'll respond automatically."}</p>
            </div>

            {(heard || reply) && (
              <div className="voice-card w-full max-w-lg space-y-1.5 rounded-2xl p-3 text-left">
                {heard && <p className="text-sm"><span className="font-semibold">You: </span>{heard}</p>}
                {reply && <p className="line-clamp-4 text-sm leading-relaxed"><span className="font-semibold text-primary">Allma: </span>{reply}</p>}
              </div>
            )}

            {/* Mobile controls */}
            <div className="voice-card grid w-full max-w-lg grid-cols-3 gap-1.5 rounded-2xl p-1.5 lg:hidden">
              <button type="button" onClick={() => { skipIntro(); stopLoop(false); }} className="flex min-h-14 min-w-0 items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-2 text-left active:scale-[0.97]">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-destructive text-destructive-foreground"><Square className="size-3.5 fill-current" /></span>
                <span className="min-w-0 leading-tight"><span className="block truncate text-sm font-semibold text-destructive">Stop</span><span className="block truncate text-[11px] text-muted-foreground">end voice</span></span>
              </button>
              <button type="button" disabled={!reply} onClick={repeat} className="flex min-h-14 min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-2 text-left active:scale-[0.97] disabled:opacity-45">
                <RotateCcw className="size-5 shrink-0 text-primary" />
                <span className="min-w-0 leading-tight"><span className="block truncate text-sm font-semibold text-primary">Repeat</span><span className="block truncate text-[11px] text-muted-foreground">last reply</span></span>
              </button>
              <button type="button" onClick={() => { skipIntro(); stopLoop(true); }} className="flex min-h-14 min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-2 text-left active:scale-[0.97]">
                <LogOut className="size-5 shrink-0" />
                <span className="min-w-0 leading-tight"><span className="block truncate text-sm font-semibold">Exit</span><span className="block truncate text-[11px] text-muted-foreground">hands-free</span></span>
              </button>
            </div>

            <button type="button" onClick={() => { skipIntro(); void ask("This is an emergency. I need help right now."); }}
              className="flex w-full max-w-lg items-center gap-3 rounded-2xl border border-destructive/30 bg-gradient-to-r from-destructive/15 to-destructive/5 p-3 text-left shadow-sm active:scale-[0.99] lg:hidden">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-md"><Siren className="size-6" /></span>
              <span className="min-w-0 flex-1"><span className="block text-base font-bold text-destructive">Emergency SOS</span><span className="block text-xs text-muted-foreground">Say "emergency" or "help", or tap</span></span>
              <ChevronRight className="size-5 shrink-0 text-destructive" />
            </button>

            <div className="flex w-full max-w-lg items-center justify-between gap-2 pt-1 text-left lg:hidden">
              <div className="flex min-w-0 items-center gap-2"><MapPin className="size-5 shrink-0 text-primary" /><div className="min-w-0"><p className="truncate font-bold">Nearby Help</p><p className="truncate text-xs text-muted-foreground">Find the right help, near you.</p></div></div>
              <button type="button" onClick={() => go("/nearby")} className="voice-card inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-primary"><MapIcon className="size-4" /> View on Map <ChevronRight className="size-3.5" /></button>
            </div>

            <ul className="grid w-full max-w-lg grid-cols-2 gap-2 lg:hidden">
              {cards.slice(0, intro ? Math.max(0, shown - 1) : 4).map((c) => (
                <li key={c.label} className="min-w-0">
                  <button type="button" onClick={() => { skipIntro(); void ask(c.prompt); }} className="voice-card flex h-full w-full min-w-0 items-center gap-2.5 rounded-2xl p-3 text-left active:scale-[0.98] animate-in fade-in slide-in-from-top-4 duration-500">
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", c.tone)}><c.icon className="size-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{c.label}</span><span className="block truncate text-[11px] text-muted-foreground">{c.sub}</span></span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>

            {/* Desktop controls */}
            <div className="voice-card hidden items-center gap-1 rounded-full p-1.5 lg:flex">
              {voice.recording
                ? <Button variant="ghost" className="rounded-full" onClick={() => void voice.stop()}><Send className="size-4" /> Done speaking</Button>
                : <Button variant="ghost" className="rounded-full" disabled={busy} onClick={tapTalk}><Mic className="size-4" /> Tap to talk</Button>}
              <Button variant="ghost" className="rounded-full" disabled={!reply} onClick={repeat}><RotateCcw className="size-4" /> Repeat</Button>
              <Button variant="ghost" className="rounded-full text-destructive" onClick={() => { skipIntro(); stopLoop(false); }}><Square className="size-4 fill-current" /> End</Button>
            </div>

            <div className="voice-card flex w-full max-w-lg items-center justify-between gap-2 rounded-full px-4 py-2 text-xs text-muted-foreground lg:hidden">
              <span className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-primary" /> Allma is here to keep you safe</span>
              {voice.recording && <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 font-medium text-success"><Lock className="size-3" /> Mic active</span>}
            </div>
          </main>

          {/* Desktop right quick actions */}
          <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto p-6 lg:flex">
            {side.map((c) => (
              <button key={c.label} type="button" onClick={() => { skipIntro(); void ask(c.prompt); }} className="voice-card flex items-center gap-3 rounded-2xl p-3 text-left transition-transform hover:-translate-y-0.5">
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", c.icon === Siren ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground")}><c.icon className="size-5" /></span>
                <span><span className="block text-sm font-bold">{c.label}</span><span className="text-xs text-muted-foreground">{c.sub}</span></span>
              </button>
            ))}
            <p className="mt-auto -rotate-6 text-right font-serif text-xl italic text-primary">Safer Communities<br />Stronger Uganda <Heart className="inline size-4 text-destructive" /></p>
          </aside>
        </div>
      </div>
    </div>
  );
}
