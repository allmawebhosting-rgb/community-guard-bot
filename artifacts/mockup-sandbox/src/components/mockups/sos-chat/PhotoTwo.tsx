import { useState } from "react";
import {
  AudioLines,
  Bot,
  Check,
  ChevronDown,
  Menu,
  Mic,
  Plus,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import "./_group.css";

function PersonAvatar({
  label,
  tone = "bg-[#dff5e9] text-[#168847]",
  size = "h-10 w-10",
}: {
  label: string;
  tone?: string;
  size?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`grid ${size} shrink-0 place-items-center rounded-full border-2 border-white text-xs font-bold shadow-[0_2px_8px_rgba(23,83,53,0.12)] ${tone}`}
    >
      {label}
    </span>
  );
}

export function PhotoTwo() {
  const [recipient, setRecipient] = useState<"allma" | "responders">("allma");
  const [showJoinedNotice, setShowJoinedNotice] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);

  return (
    <main className="min-h-[100dvh] bg-[#eaf7f1] font-sans text-[#17231d] sm:grid sm:place-items-center sm:p-6">
      <section className="relative mx-auto flex h-[100dvh] min-h-[620px] w-full max-w-[520px] flex-col overflow-hidden bg-[#f4fbf8] sm:h-[min(900px,calc(100dvh-48px))] sm:min-h-0 sm:rounded-[30px] sm:border sm:border-white/90 sm:shadow-[0_24px_80px_rgba(31,105,69,0.16)]">
        <header className="relative z-10 flex h-[76px] shrink-0 items-center gap-3 border-b border-[#dceee5] bg-white/95 px-4 sm:px-5">
          <button
            type="button"
            aria-label={menuOpen ? "Close conversation details" : "Open conversation details"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#557065] transition-colors hover:bg-[#eef7f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#208e51]"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e2f6e9] text-[#138944] ring-1 ring-[#ccebd8]">
            <Bot className="h-[25px] w-[25px]" strokeWidth={2.1} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] font-bold tracking-[-0.02em] text-[#18271f]">
              Allma Safety AI
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-[#557166]">
              <span className="h-2 w-2 rounded-full bg-[#23ad62] shadow-[0_0_0_3px_#e6f7ed]" />
              Online · shared conversation
            </p>
          </div>
          <span className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#f2d4cc] bg-[#fff7f4] px-3 text-[10px] font-bold uppercase tracking-[0.08em] text-[#aa5645]">
            <ShieldAlert className="h-4 w-4" />
            SOS
          </span>
        </header>

        {menuOpen && (
          <div className="absolute left-4 top-[66px] z-20 w-[min(310px,calc(100%-32px))] rounded-2xl border border-[#dceee5] bg-white p-4 shadow-[0_16px_40px_rgba(20,62,42,0.14)]">
            <p className="font-display text-sm font-bold text-[#1a3024]">Emergency conversation</p>
            <p className="mt-1 text-xs leading-relaxed text-[#65786e]">
              Allma AI and Safety Responders are in one shared chat.
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#f0f8f3] px-3 py-2 text-xs font-medium text-[#3d6952]">
              <ShieldCheck className="h-4 w-4 text-[#18884a]" />
              Emergency SOS activated
            </div>
          </div>
        )}

        <section
          aria-label="SOS conversation"
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_at_15%_5%,rgba(211,246,227,0.5),transparent_38%),linear-gradient(160deg,#f1faf6_0%,#f8fcfa_52%,#eef8f2_100%)]"
        >
          <div className="flex-1 space-y-[18px] overflow-y-auto overscroll-contain px-4 pb-5 pt-4 sm:px-5 sm:pt-5">
            <div className="mx-auto flex max-w-[365px] items-center justify-center gap-2 rounded-full border border-[#d8e9e0] bg-white/80 px-3.5 py-2 text-center text-[10px] leading-snug text-[#64776d] shadow-[0_2px_8px_rgba(38,86,58,0.04)]">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-[#7d9487]" />
              Emergency SOS activated. Safety Network notifications are starting.
            </div>

            <div className="flex items-end gap-2.5">
              <PersonAvatar label="AI" tone="bg-[#dff5e9] text-[#128847]" size="h-10 w-10" />
              <div className="min-w-0 max-w-[85%]">
                <p className="mb-1.5 ml-1 text-[11px] font-bold tracking-[0.01em] text-[#218e4d]">
                  Allma AI
                </p>
                <div className="rounded-[22px] rounded-bl-[7px] bg-white px-4 py-3 shadow-[0_5px_18px_rgba(40,87,59,0.08)] ring-1 ring-[#e3eee8]">
                  <p className="text-[15px] leading-[1.45] tracking-[-0.015em] text-[#1e2822] sm:text-[16px]">
                    I’m here. Your responder has joined the conversation.
                  </p>
                </div>
                <time className="ml-2 mt-1.5 block text-[10px] font-medium text-[#85948b]">10:24 AM</time>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="max-w-[84%] text-right">
                <div className="rounded-[22px] rounded-br-[7px] bg-[#d8f5c8] px-4 py-3 text-left shadow-[0_5px_18px_rgba(54,130,72,0.08)] ring-1 ring-[#c8ebba]">
                  <p className="mb-0.5 text-[13px] font-bold text-[#218c43]">You</p>
                  <p className="text-[15px] leading-[1.45] tracking-[-0.015em] text-[#213027] sm:text-[16px]">
                    Thank you. I need help.
                  </p>
                  <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px] font-medium text-[#788b7e]">
                    <time>10:25 AM</time>
                    <Check className="h-3.5 w-3.5 text-[#278c54]" />
                    <Check className="-ml-2 h-3.5 w-3.5 text-[#278c54]" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-end gap-2.5">
              <PersonAvatar label="D" tone="bg-[#e1edf8] text-[#2569ad]" size="h-10 w-10" />
              <div className="min-w-0 max-w-[85%]">
                <p className="mb-1.5 ml-1 text-[11px] font-bold tracking-[0.01em] text-[#2874c4]">
                  David <span className="font-medium text-[#82938a]">· Safety Responder</span>
                </p>
                <div className="rounded-[22px] rounded-bl-[7px] bg-white px-4 py-3 shadow-[0_5px_18px_rgba(40,87,59,0.08)] ring-1 ring-[#e3eee8]">
                  <p className="text-[15px] leading-[1.45] tracking-[-0.015em] text-[#1e2822] sm:text-[16px]">
                    I’ve received your SOS. I’m here to help.
                  </p>
                </div>
                <time className="ml-2 mt-1.5 block text-[10px] font-medium text-[#85948b]">10:26 AM</time>
              </div>
            </div>

            {showJoinedNotice && (
              <div
                role="status"
                className="relative mx-auto flex w-full max-w-[440px] items-center gap-3 rounded-[22px] bg-[linear-gradient(110deg,#20b85b_0%,#0b9862_100%)] px-4 py-3.5 text-white shadow-[0_12px_28px_rgba(12,143,79,0.2)] sm:gap-4 sm:px-5"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/20 ring-1 ring-white/25">
                  <Users className="h-6 w-6" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[14px] font-bold leading-tight tracking-[-0.015em] sm:text-[16px]">
                    Responder joined your emergency
                  </p>
                  <p className="mt-1 text-[12px] leading-snug text-white/90 sm:text-[13px]">
                    David is now part of this conversation.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss responder joined notice"
                  onClick={() => setShowJoinedNotice(false)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/95 transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <X className="h-6 w-6" strokeWidth={2.5} />
                </button>
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-[#dceee5] bg-white/95 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(31,84,54,0.04)] sm:px-5 sm:pb-4">
            <div className="mb-3 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                aria-pressed={recipient === "allma"}
                onClick={() => setRecipient("allma")}
                className={`relative flex min-h-[67px] items-center gap-2 rounded-[18px] px-3 text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#188e4a] sm:gap-3 sm:px-4 ${
                  recipient === "allma"
                    ? "bg-[linear-gradient(115deg,#20c84f,#04a844)] text-white shadow-[0_5px_14px_rgba(12,158,64,0.2)] ring-2 ring-[#8ce2a4] ring-offset-2 ring-offset-white"
                    : "bg-white text-[#1c2b22] shadow-[0_3px_12px_rgba(31,75,51,0.08)] ring-1 ring-[#dce8e1] hover:bg-[#f7fbf8]"
                }`}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${recipient === "allma" ? "bg-white/15" : "bg-[#edf8f1] text-[#168a48]"}`}>
                  <Sparkles className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block min-w-0 font-display text-[11px] font-bold leading-tight sm:text-[14px]">
                    Ask Allma AI
                  </span>
                  <span className={`mt-1 block truncate text-[9px] leading-tight sm:text-[10px] ${recipient === "allma" ? "text-white/85" : "text-[#75877d]"}`}>
                    Ask for guidance
                  </span>
                </span>
                {recipient === "allma" && <Check className="h-5 w-5 shrink-0" strokeWidth={3} />}
              </button>

              <button
                type="button"
                aria-pressed={recipient === "responders"}
                onClick={() => setRecipient("responders")}
                className={`relative flex min-h-[67px] items-center gap-2 rounded-[18px] px-3 text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#188e4a] sm:gap-3 sm:px-4 ${
                  recipient === "responders"
                    ? "bg-[linear-gradient(115deg,#20c84f,#04a844)] text-white shadow-[0_5px_14px_rgba(12,158,64,0.2)] ring-2 ring-[#8ce2a4] ring-offset-2 ring-offset-white"
                    : "bg-white text-[#1c2b22] shadow-[0_3px_12px_rgba(31,75,51,0.08)] ring-1 ring-[#dce8e1] hover:bg-[#f7fbf8]"
                }`}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${recipient === "responders" ? "bg-white/15" : "bg-[#f0f1f8] text-[#384060]"}`}>
                  <Users className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block min-w-0 font-display text-[11px] font-bold leading-tight sm:text-[14px]">
                    Message Responders
                  </span>
                  <span className={`mt-1 block truncate text-[9px] leading-tight sm:text-[10px] ${recipient === "responders" ? "text-white/85" : "text-[#75877d]"}`}>
                    1 in this chat
                  </span>
                </span>
                {recipient === "responders" && <Check className="h-5 w-5 shrink-0" strokeWidth={3} />}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex h-[46px] min-w-0 flex-1 items-center gap-2 rounded-full border border-[#dce8e1] bg-[#fbfdfc] px-2 shadow-[0_2px_8px_rgba(31,75,51,0.04)]">
                <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eef5f0] text-[#5d7568]">
                  <Plus className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-[#829189] sm:text-[13px]">
                  {recipient === "allma" ? "Ask Allma in this emergency…" : "Message Safety Responders…"}
                </span>
                <Mic className="mr-1 h-[18px] w-[18px] shrink-0 text-[#678072]" />
              </div>
              <button
                type="button"
                aria-label={voiceMode ? "Turn off voice mode" : "Open voice mode"}
                aria-pressed={voiceMode}
                onClick={() => setVoiceMode((active) => !active)}
                className={`grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#188e4a] focus-visible:ring-offset-2 ${
                  voiceMode ? "bg-[#168a4a] text-white" : "bg-[#183a29] text-white hover:bg-[#24573b]"
                }`}
              >
                {voiceMode ? <ChevronDown className="h-5 w-5" /> : <AudioLines className="h-5 w-5" />}
              </button>
            </div>
          </footer>
        </section>
      </section>
    </main>
  );
}
