import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2, Mic, Square, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PREF_KEY = "allma.voice.pref"; // "on" | "off"
const GREETING = "Hello, I'm Allma, your safety assistant. Tap the microphone and tell me how I can help.";

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

export function VoiceAssistant() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [pref, setPref] = useState<"on" | "off" | null | "unknown">("unknown");
  const [open, setOpen] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = turns;

  useEffect(() => {
    const v = localStorage.getItem(PREF_KEY);
    setPref(v === "on" || v === "off" ? v : null);
  }, []);

  const say = useCallback((text: string) => {
    setSpeaking(true);
    speak(text, () => setSpeaking(false));
  }, []);

  const ask = useCallback(
    async (text: string) => {
      const next = [...turnsRef.current, { role: "user" as const, content: text }];
      setTurns(next);
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
        setTurns((t) => [...t, { role: "assistant", content: reply }]);
        say(reply);
        if (nav?.[1]) void navigate({ to: nav[1] as "/" });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Allma could not answer.");
      } finally {
        setThinking(false);
      }
    },
    [navigate, path, say],
  );

  const voice = useVoiceInput({
    onTranscript: (t) => void ask(t),
    onError: (m) => toast.error(m),
  });

  const enable = () => {
    localStorage.setItem(PREF_KEY, "on");
    setPref("on");
    setOpen(true);
    setTurns([{ role: "assistant", content: GREETING }]);
    say(GREETING);
  };
  const decline = () => {
    localStorage.setItem(PREF_KEY, "off");
    setPref("off");
  };

  const micTap = () => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    voice.toggle();
  };

  if (pref === "unknown" || path.startsWith("/sos") || path.startsWith("/police")) return null;

  if (pref === null) {
    return (
      <div role="dialog" aria-label="Use voice assistant" className="fixed inset-x-3 bottom-4 z-[60] mx-auto max-w-md rounded-2xl border border-border bg-card p-4 shadow-2xl sm:inset-x-auto sm:right-4">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Volume2 className="size-5" /></div>
          <div className="min-w-0">
            <p className="font-semibold">Would you like to use voice?</p>
            <p className="mt-1 text-sm text-muted-foreground">Talk to Allma, your AI safety assistant, hands-free anywhere in the app.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={enable}>Yes, use voice</Button>
              <Button size="sm" variant="ghost" onClick={decline}>Not now</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const status = voice.recording ? "Listening… tap to send" : voice.transcribing || thinking ? "Thinking…" : speaking ? "Speaking…" : "Tap the mic to talk";

  return (
    <>
      {open && (
        <div className="fixed inset-x-3 bottom-24 z-[60] mx-auto flex max-h-[60vh] max-w-md flex-col rounded-2xl border border-border bg-card shadow-2xl sm:inset-x-auto sm:right-4">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Allma Voice</p>
              <p className="text-xs text-muted-foreground" aria-live="polite">{status}</p>
            </div>
            <Button size="icon" variant="ghost" aria-label="Close voice assistant" onClick={() => { window.speechSynthesis?.cancel(); voice.cancel(); setOpen(false); }}><X className="size-4" /></Button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm">
            {turns.map((t, i) => (
              <p key={i} className={cn("rounded-xl px-3 py-2", t.role === "user" ? "ml-8 bg-primary text-primary-foreground" : "mr-8 bg-muted")}>{t.content}</p>
            ))}
          </div>
          <div className="flex justify-between gap-2 border-t border-border px-4 py-2 text-xs">
            <button className="text-muted-foreground underline" onClick={() => { localStorage.setItem(PREF_KEY, "off"); setPref("off"); setOpen(false); }}>Turn voice off</button>
            {speaking && <button className="underline" onClick={() => { window.speechSynthesis.cancel(); setSpeaking(false); }}>Stop speaking</button>}
          </div>
        </div>
      )}
      <button
        aria-label={voice.recording ? "Stop and send" : "Talk to Allma"}
        onClick={() => { if (!open) { setOpen(true); if (!turns.length) setTurns([{ role: "assistant", content: GREETING }]); } if (pref === "off") { localStorage.setItem(PREF_KEY, "on"); setPref("on"); } micTap(); }}
        className={cn(
          "fixed bottom-4 right-4 z-[60] grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-105",
          voice.recording && "bg-destructive text-destructive-foreground",
        )}
        style={voice.recording ? { boxShadow: `0 0 0 ${4 + voice.level * 14}px color-mix(in oklab, var(--destructive) 30%, transparent)` } : undefined}
      >
        {voice.transcribing || thinking ? <Loader2 className="size-6 animate-spin" /> : voice.recording ? <Square className="size-5" /> : <Mic className="size-6" />}
      </button>
    </>
  );
}
