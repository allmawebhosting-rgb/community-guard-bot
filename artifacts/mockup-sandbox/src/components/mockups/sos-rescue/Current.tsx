import { useState } from "react";
import {
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Volume2,
  VolumeX,
} from "lucide-react";
import "./_group.css";

function Avatar({ initials, tone }: { initials: string; tone: string }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-xs font-bold text-white ${tone}`}
    >
      {initials}
    </span>
  );
}

export function Current() {
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);

  return (
    <main className="dark min-h-screen bg-background px-3 py-4 font-sans text-foreground sm:px-4">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[460px] flex-col gap-3">
        <header className="flex items-center justify-between rounded-2xl border border-white/10 bg-card/90 px-3.5 py-3 shadow-xl">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Allma Safety AI
            </p>
            <p className="mt-0.5 text-sm font-semibold">Emergency active</p>
          </div>
          <span className="rounded-full border border-red-400/30 bg-red-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-300">
            Live SOS
          </span>
        </header>

        <section
          aria-label="Emergency call controls"
          className="sticky top-0 z-10 rounded-2xl border border-emerald-400/25 bg-card/95 p-3 shadow-xl backdrop-blur-md"
        >
          <div className="flex items-center gap-2.5">
            <span className="relative grid h-9 w-9 shrink-0 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/20" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_14px_3px_rgba(52,211,153,0.45)]" />
            </span>
            <Avatar initials="SN" tone="bg-gradient-to-br from-emerald-500 to-teal-800" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">Sarah Namusoke</p>
              <p className="truncate text-[11px] text-muted-foreground">Sister · Connected</p>
            </div>
            <span className="font-mono text-sm font-semibold tabular-nums">02:05</span>
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => setMuted((value) => !value)}
              aria-label={muted ? "Unmute call" : "Mute call"}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-foreground"
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setSpeaker((value) => !value)}
              aria-label={speaker ? "Use earpiece" : "Use speaker"}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-foreground"
            >
              {speaker ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button
              type="button"
              aria-label="Hang up emergency call"
              className="grid h-9 w-11 place-items-center rounded-full bg-red-500 text-white"
            >
              <PhoneOff className="h-4 w-4" />
            </button>
            <span className="ml-auto text-[10px] text-muted-foreground">
              Call controls are pinned above the chat.
            </span>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-card/70 p-3.5">
          <div className="flex items-start gap-2.5">
            <Avatar initials="AI" tone="bg-gradient-to-br from-slate-500 to-slate-800" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-muted-foreground">Allma</p>
              <p className="mt-1 rounded-2xl rounded-tl-sm border border-white/10 bg-white/5 px-3 py-2 text-sm leading-relaxed">
                Are you safe right now? I can help you decide what to do next.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-muted-foreground">
                  Yes, I&apos;m safe
                </span>
                <span className="rounded-full border border-red-400/20 bg-red-400/5 px-2.5 py-1 text-[10px] text-red-200">
                  No, I&apos;m in danger
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-label="SOS group chat"
          className="flex min-h-[400px] flex-1 flex-col gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.035] p-3.5"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-foreground">
                SOS group chat
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">2 people in this room</p>
            </div>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Live
            </span>
          </div>

          <div className="flex items-end gap-2">
            <Avatar initials="AM" tone="bg-gradient-to-br from-amber-500 to-orange-800" />
            <div className="min-w-0 max-w-[84%]">
              <p className="mb-1 text-[10px] text-muted-foreground">You · SOS caller · 8:42 PM</p>
              <p className="rounded-2xl rounded-bl-sm border border-white/10 bg-card px-3 py-2 text-[13px] leading-relaxed">
                I&apos;m outside the clinic gate. Please stay on the line with me.
              </p>
            </div>
          </div>

          <div className="flex items-end gap-2">
            <Avatar initials="SN" tone="bg-gradient-to-br from-emerald-500 to-teal-800" />
            <div className="min-w-0 max-w-[84%]">
              <p className="mb-1 text-[10px] text-muted-foreground">Sarah · Responder · 8:43 PM</p>
              <div className="rounded-2xl rounded-bl-sm border border-white/10 bg-card px-3 py-2 text-[13px] leading-relaxed">
                I&apos;m connected with you. I can see your shared location.
              </div>
            </div>
          </div>

          <div className="ml-11 flex items-center gap-2 rounded-xl border border-white/10 bg-card/80 px-3 py-2">
            <button type="button" aria-label="Play voice note" className="text-foreground">
              <Mic className="h-4 w-4" />
            </button>
            <div className="flex h-5 flex-1 items-center gap-[3px]" aria-hidden="true">
              {[9, 15, 7, 18, 11, 6, 14, 8, 17, 10, 6, 13, 8, 16].map((height, index) => (
                <span key={index} className="w-[3px] rounded-full bg-emerald-400/70" style={{ height }} />
              ))}
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">0:12</span>
          </div>

          <div className="mt-auto border-t border-white/10 pt-3">
            <div className="flex flex-wrap gap-1.5">
              <a href="tel:999" className="rounded-full border border-red-400/30 bg-red-400/10 px-2.5 py-1.5 text-[10px] font-semibold text-red-200">
                Call 999 Police
              </a>
              <a href="tel:112" className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1.5 text-[10px] font-semibold text-amber-100">
                Call 112 Toll-free
              </a>
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/15 p-1.5">
              <span className="flex-1 px-2 text-xs text-muted-foreground">Message your responders…</span>
              <button type="button" aria-label="Send message" className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500 text-slate-950">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
