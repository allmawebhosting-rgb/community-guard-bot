import { useState } from "react";
import {
  AudioLines,
  Bot,
  Menu,
  Mic,
  Plus,
  ShieldAlert,
  Users,
} from "lucide-react";
import "./_group.css";

function PersonAvatar({ label, tone = "bg-violet-200 text-violet-800" }: { label: string; tone?: string }) {
  return (
    <span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tone} text-xs font-semibold`}>
      {label}
    </span>
  );
}

export function Current() {
  const [recipient, setRecipient] = useState<"allma" | "responders">("allma");

  return (
    <main className="flex min-h-screen flex-col overflow-hidden bg-background font-sans text-foreground">
      <header className="flex h-[74px] shrink-0 items-center gap-3 border-b border-border/60 bg-white px-4">
        <button type="button" aria-label="Open menu" className="rounded-full p-2 text-muted-foreground">
          <Menu className="h-5 w-5" />
        </button>
        <span className="grid h-10 w-10 place-items-center rounded-full border border-rose-100 bg-rose-50 text-rose-600">
          <Bot className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">Allma Safety AI</p>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Online
          </p>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-full bg-rose-600 text-white shadow-md">
          <ShieldAlert className="h-5 w-5" />
        </span>
      </header>

      <section aria-label="SOS conversation" className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[linear-gradient(160deg,#f6faf8,#fffdf9_65%,#f3fbf6)]">
        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-5 pt-16">
          <div className="mx-auto flex max-w-[340px] items-center justify-center gap-2 rounded-full border border-stone-200 bg-white/80 px-3 py-2 text-center text-[11px] leading-snug text-stone-600">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            Emergency SOS activated. Safety Network notifications are starting.
          </div>
          <div className="mx-auto flex max-w-[300px] items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-[11px] text-emerald-700">
            <Users className="h-3.5 w-3.5 shrink-0" />
            allma22 joined the shared conversation.
          </div>

          <div className="flex items-end gap-2">
            <PersonAvatar label="A" />
            <div className="max-w-[78%]">
              <p className="mb-1 flex flex-wrap gap-1.5 text-[10px] text-stone-600">
                <span className="font-semibold">allma22</span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5">Safety contact</span>
                <span className="rounded-full border border-stone-200 bg-white px-2 py-0.5">To: Safety Responders</span>
              </p>
              <div className="rounded-[1.35rem] rounded-bl-md bg-white px-3.5 py-2.5 shadow-sm ring-1 ring-stone-200/80">
                <p className="text-[12px] font-bold text-sky-600">allma22</p>
                <p className="mt-0.5 text-[15px]">Hi</p>
              </div>
              <time className="mt-1 block text-[10px] text-stone-500">4:22 AM</time>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="max-w-[78%] text-right">
              <p className="mb-1 text-[10px] text-stone-500">To: Safety Responders</p>
              <div className="rounded-[1.35rem] rounded-br-md bg-rose-100 px-3.5 py-2.5 text-left shadow-sm ring-1 ring-rose-200">
                <p className="text-[12px] font-bold text-rose-600">You</p>
                <p className="mt-0.5 text-[15px]">Hes</p>
              </div>
              <time className="mt-1 block text-[10px] text-stone-500">4:22 AM</time>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-emerald-100 bg-white/90 px-2.5 pb-4 pt-2.5">
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              aria-pressed={recipient === "allma"}
              onClick={() => setRecipient("allma")}
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-2.5 text-left shadow-sm ${recipient === "allma" ? "bg-rose-600 text-white" : "bg-white text-foreground ring-1 ring-stone-200"}`}
            >
              <Bot className="h-5 w-5 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold">Ask Allma AI</span>
                <span className="block truncate text-[10px] opacity-80">Ask Allma for guidance</span>
              </span>
            </button>
            <button
              type="button"
              aria-pressed={recipient === "responders"}
              onClick={() => setRecipient("responders")}
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-2.5 text-left shadow-sm ${recipient === "responders" ? "bg-rose-600 text-white" : "bg-white text-foreground ring-1 ring-stone-200"}`}
            >
              <Users className="h-5 w-5 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold">Message Responders</span>
                <span className="block truncate text-[10px] text-muted-foreground">1 in this chat</span>
              </span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-stone-200 bg-white px-2 shadow-sm">
              <button type="button" aria-label="Add attachment" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-stone-100">
                <Plus className="h-5 w-5" />
              </button>
              <span className="min-w-0 flex-1 truncate text-sm text-stone-500">Ask Allma in this emergency…</span>
              <Mic className="mr-1 h-5 w-5 shrink-0 text-stone-600" />
            </div>
            <button type="button" aria-label="Open voice mode" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black text-white">
              <AudioLines className="h-5 w-5" />
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
