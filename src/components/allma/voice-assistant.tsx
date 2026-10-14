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
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const u = () => setOnline(navigator.onLine);
    u();
    window.addEventListener("online", u);
    window.addEventListener("offline", u);
    return () => { window.removeEventListener("online", u); window.removeEventListener("offline", u); };
  }, []);
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
    <div className={cn("flex h-[clamp(3rem,9dvh,5.5rem)] min-w-0 flex-1 items-center gap-[3px] overflow-hidden", dir === -1 ? "justify-end" : "justify-start")} aria-hidden>
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
        {/* A. Compact identity header */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 pb-2 lg:px-8" style={{ paddingTop: "max(env(safe-area-inset-top), 0.75rem)" }}>
          <div className="flex min-w-0 items-center gap-2.5 lg:invisible">
            <span className="voice-avatar-ring shrink-0 rounded-full p-[2px]"><MascotAvatar className="size-10 bg-card" /></span>
            <div className="min-w-0 leading-tight">
              <p className="flex items-center gap-2 font-display text-[15px] font-bold text-[var(--vn)]">
                Allma Voice
                <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold", online ? "text-success" : "text-muted-foreground")}>
                  <span className={cn("size-1.5 rounded-full", online ? "bg-success" : "bg-muted-foreground")} />{online ? "Online" : "Offline"}
                </span>
              </p>
              <p className="text-xs text-[var(--vm)]">Your Safety & Community AI</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="voice-chip hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold min-[380px]:inline-flex"><AudioLines className="size-3.5" /> Voice Mode</span>
            <button type="button" className="voice-ctrl grid size-10 place-items-center rounded-full" aria-label="Switch to text mode" onClick={() => { skipIntro(); stopLoop(true); }}><Keyboard className="size-[18px]" /></button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col items-center gap-[clamp(0.75rem,2dvh,1.25rem)] overflow-y-auto overscroll-contain px-4 text-center lg:justify-center lg:gap-4 lg:pb-6" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1rem)" }}>
            <MascotAvatar className="hidden size-28 lg:block" />
            <div className="hidden lg:block">
              <h2 className={cn("text-3xl font-bold tracking-tight lg:text-5xl", phase === "listening" && "voice-title")}>{headline}</h2>
              <p className="mt-1 text-muted-foreground">{sub}</p>
            </div>

            {/* B. Voice centerpiece */}
            <section className="voice-stage relative flex w-full max-w-lg flex-col items-center rounded-[2rem] px-3 pb-4 pt-[clamp(0.75rem,3dvh,1.75rem)] lg:bg-transparent lg:shadow-none">
              <div className="flex w-full items-center justify-center gap-2">
                <Bars dir={-1} />
                <button type="button" aria-label={voice.recording ? "Done speaking" : "Tap to talk"} disabled={busy}
                  onClick={() => (voice.recording ? void voice.stop() : tapTalk())}
                  data-phase={phase}
                  className="voice-orb relative grid size-[clamp(5.5rem,16dvh,8.5rem)] shrink-0 place-items-center rounded-full text-primary-foreground transition-transform duration-100 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--vb)]/40 lg:size-44"
                  style={{ transform: `scale(${1 + (voice.recording ? voice.level * 0.35 : 0)})` }}>
                  {busy ? <Loader2 className="size-9 animate-spin lg:size-12" /> : speaking ? <AudioLines className="size-10 lg:size-14" /> : <Mic className="size-10 lg:size-14" />}
                </button>
                <Bars dir={1} />
              </div>

              <span className={cn("voice-chip mt-[clamp(0.75rem,2dvh,1.25rem)] inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold",
                hint ? "text-destructive" : phase === "listening" ? "text-success" : phase === "speaking" ? "text-[var(--vp)]" : "text-[var(--vn)]")} aria-live="polite">
                <span className={cn("size-2 rounded-full", hint ? "bg-destructive" : phase === "listening" ? "bg-success animate-pulse" : phase === "thinking" ? "bg-gold animate-pulse" : phase === "speaking" ? "bg-[var(--vp)] animate-pulse" : "bg-muted-foreground")} />
                {hint ? "Didn't catch that" : { intro: "Introducing", listening: "Listening", thinking: "Processing", speaking: "Speaking", ready: "Ready" }[phase]}
              </span>
              <p className="mt-1.5 text-[15px] font-medium text-[var(--vn)]">
                {hint ? "I couldn't hear that. Please try again." : { intro: "Hi, I'm Allma — here's what I can do.", listening: "I'm listening — speak naturally.", thinking: "I'm preparing your answer.", speaking: "Allma is speaking.", ready: "Tap the orb to talk to Allma." }[phase]}
              </p>
              {hint && <p className="mt-0.5 text-xs text-[var(--vm)]">{hint}</p>}

              {(heard || reply) && (
                <div className="mt-3 w-full space-y-2 text-left">
                  {heard && <p className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-[var(--vn)] px-3 py-2 text-sm text-primary-foreground">{heard}</p>}
                  {reply && <p className="voice-bubble w-fit max-w-[92%] rounded-2xl rounded-bl-md px-3 py-2 text-sm leading-relaxed text-[var(--vn)] line-clamp-5">{reply}</p>}
                </div>
              )}

              {/* C. Control dock */}
              <div className="mt-4 grid w-full grid-cols-4 gap-1.5 lg:hidden">
                {[
                  { k: "stop", label: "Stop", icon: Square, on: () => { skipIntro(); stopLoop(false); }, cls: "text-destructive", fill: true },
                  { k: "rep", label: "Repeat", icon: RotateCcw, on: repeat, dis: !reply },
                  { k: "type", label: "Keyboard", icon: Keyboard, on: () => { skipIntro(); stopLoop(true); } },
                  { k: "exit", label: "Exit", icon: LogOut, on: () => { skipIntro(); stopLoop(true); } },
                ].map((b) => (
                  <button key={b.k} type="button" disabled={b.dis} onClick={b.on}
                    className={cn("voice-ctrl flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-semibold active:scale-95 disabled:pointer-events-none disabled:opacity-40", b.cls ?? "text-[var(--vn)]")}>
                    <b.icon className={cn("size-[18px]", b.fill && "fill-current")} />
                    <span className="max-w-full truncate">{b.label}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* D. Emergency SOS */}
            <button type="button" onClick={() => { skipIntro(); void ask("This is an emergency. I need help right now."); }}
              className="voice-sos grid w-full max-w-lg grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-3xl p-3.5 text-left active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-destructive/30 lg:hidden">
              <span className="grid size-12 place-items-center rounded-2xl bg-destructive text-destructive-foreground shadow-md"><Siren className="size-6" /></span>
              <span className="min-w-0"><span className="block font-display text-base font-bold text-destructive">Emergency SOS</span><span className="block text-xs text-[var(--vm)]">Say "emergency" or "help", or tap to start.</span></span>
              <span className="grid size-8 place-items-center rounded-full bg-destructive/10 text-destructive"><ChevronRight className="size-4" /></span>
            </button>

            {/* E. Nearby Help */}
            <section className="w-full max-w-lg text-left lg:hidden">
              <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 px-1">
                <div className="min-w-0"><p className="font-display text-base font-bold text-[var(--vn)]">Nearby Help</p><p className="text-xs text-[var(--vm)]">Find the right help, near you.</p></div>
                <button type="button" onClick={() => go("/nearby")} className="voice-chip inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"><MapIcon className="size-3.5" /> View on Map</button>
              </div>
              <ul className="grid grid-cols-1 gap-2 min-[340px]:grid-cols-2">
                {cards.slice(0, intro ? Math.max(0, shown - 1) : 4).map((c) => (
                  <li key={c.label} className="min-w-0">
                    <button type="button" onClick={() => { skipIntro(); void ask(c.prompt); }} className="voice-tile flex h-full min-h-[4.5rem] w-full min-w-0 flex-col gap-2 rounded-2xl p-3 text-left active:scale-[0.98] animate-in fade-in slide-in-from-top-2 duration-300">
                      <span className="flex w-full items-center justify-between"><span className={cn("grid size-8 place-items-center rounded-xl", c.tone)}><c.icon className="size-4" /></span><ChevronRight className="size-4 text-[var(--vm)]" /></span>
                      <span className="min-w-0"><span className="block text-sm font-bold leading-snug text-[var(--vn)]">{c.label}</span><span className="block text-[11px] leading-snug text-[var(--vm)]">{c.sub}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {/* Desktop controls */}
            <div className="voice-card hidden items-center gap-1 rounded-full p-1.5 lg:flex">
              {voice.recording
                ? <Button variant="ghost" className="rounded-full" onClick={() => void voice.stop()}><Send className="size-4" /> Done speaking</Button>
                : <Button variant="ghost" className="rounded-full" disabled={busy} onClick={tapTalk}><Mic className="size-4" /> Tap to talk</Button>}
              <Button variant="ghost" className="rounded-full" disabled={!reply} onClick={repeat}><RotateCcw className="size-4" /> Repeat</Button>
              <Button variant="ghost" className="rounded-full text-destructive" onClick={() => { skipIntro(); stopLoop(false); }}><Square className="size-4 fill-current" /> End</Button>
            </div>

            {/* F. Reassurance */}
            <p className="flex items-center gap-1.5 pb-1 text-xs text-[var(--vm)] lg:hidden">
              <ShieldCheck className="size-3.5 text-[var(--vb)]" /> Allma is here to help you stay safe.
              {voice.recording && <span className="ml-1 inline-flex items-center gap-1 font-semibold text-success"><Lock className="size-3" /> Mic on</span>}
            </p>
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
