import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AudioLines,
  Check,
  ChevronDown,
  Clock3,
  MapPin,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneOff,
  Play,
  Radio,
  Send,
  ShieldCheck,
  Signal,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import "./_group.css";

type ChatMessage = {
  id: number;
  name: string;
  role: "SOS Caller" | "Responder" | "Safety Contact";
  initials: string;
  tone: string;
  time: string;
  text?: string;
  voice?: string;
  mine?: boolean;
};

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    name: "You",
    role: "SOS Caller",
    initials: "AM",
    tone: "from-[#e1a66c] to-[#9d583a]",
    time: "8:42 PM",
    text: "I'm outside the clinic gate. Please stay on the line with me.",
    mine: true,
  },
  {
    id: 2,
    name: "Sarah Namusoke",
    role: "Responder",
    initials: "SN",
    tone: "from-[#51d4a5] to-[#1b8069]",
    time: "8:43 PM",
    text: "I'm with you. I can see your shared location and I'm staying on the line.",
  },
  {
    id: 3,
    name: "Mariam Kato",
    role: "Safety Contact",
    initials: "MK",
    tone: "from-[#b4a5e8] to-[#655b9b]",
    time: "8:43 PM",
    voice: "0:12",
  },
];

const roster = [
  { name: "Sarah Namusoke", relation: "Sister · responder", initials: "SN", status: "Connected", tone: "from-[#51d4a5] to-[#1b8069]" },
  { name: "Daniel Okello", relation: "Community responder", initials: "DO", status: "Calling", tone: "from-[#deb773] to-[#94733d]" },
  { name: "Mariam Kato", relation: "Safety contact", initials: "MK", status: "Notified", tone: "from-[#b4a5e8] to-[#655b9b]" },
  { name: "Peter Ssemanda", relation: "Neighbour", initials: "PS", status: "Standby", tone: "from-[#8db7c7] to-[#527886]" },
  { name: "Grace Nanyonga", relation: "Safety contact", initials: "GN", status: "Standby", tone: "from-[#d79b98] to-[#945c61]" },
];

function InitialAvatar({ initials, tone, size = "h-9 w-9" }: { initials: string; tone: string; size?: string }) {
  return (
    <span aria-hidden="true" className={`grid ${size} shrink-0 place-items-center rounded-full border border-white/15 bg-gradient-to-br ${tone} text-[11px] font-bold tracking-wide text-white shadow-[inset_0_1px_0_rgba(255,255,255,.2)]`}>
      {initials}
    </span>
  );
}

function Waveform({ compact = false, playing = false }: { compact?: boolean; playing?: boolean }) {
  const bars = [8, 13, 19, 11, 24, 16, 27, 13, 20, 29, 17, 24, 12, 21, 15, 26, 11, 18, 28, 14, 22, 10, 17, 25, 13, 20, 9];
  return (
    <span className={`flex ${compact ? "h-8" : "h-9"} min-w-0 flex-1 items-center justify-center gap-[3px] overflow-hidden`} aria-hidden="true">
      {bars.map((height, index) => (
        <span
          key={index}
          className={`w-[3px] shrink-0 rounded-full transition-colors ${playing && index < 10 ? "bg-[#65e0b3]" : "bg-[#5eaa91]/70"}`}
          style={{ height: `${compact ? Math.max(5, height * 0.68) : height}px` }}
        />
      ))}
    </span>
  );
}

export function EmergencyRescueHub() {
  const [callState, setCallState] = useState<"connected" | "dialing" | "ended">("connected");
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const [seconds, setSeconds] = useState(125);
  const messageInput = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (callState !== "connected") return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [callState]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    setMessages((current) => [...current, {
      id: Date.now(), name: "You", role: "SOS Caller", initials: "AM", tone: "from-[#e1a66c] to-[#9d583a]", time: "8:44 PM", text, mine: true,
    }]);
    setMessage("");
    messageInput.current?.focus();
  }

  return (
    <main className="allma-rescue dark min-h-[100dvh] overflow-hidden bg-[#091310] px-3 py-5 font-sans text-[#e7f3ee] sm:px-6 sm:py-8">
      <style>{`
        @keyframes rescue-radar { 0% { transform: scale(.3); opacity: .72; } 100% { transform: scale(1.55); opacity: 0; } }
        @keyframes rescue-breathe { 0%,100% { opacity: .55; transform: scale(.92); } 50% { opacity: 1; transform: scale(1.08); } }
        @keyframes rescue-wave { 0%,100% { transform: scaleY(.62); opacity: .65; } 50% { transform: scaleY(1); opacity: 1; } }
        .rescue-radar-ring { animation: rescue-radar 2.2s cubic-bezier(.16,.7,.35,1) infinite; }
        .rescue-breathe { animation: rescue-breathe 2.4s ease-in-out infinite; }
        .rescue-wave span { transform-origin: center; animation: rescue-wave 1s ease-in-out infinite; }
        .rescue-wave span:nth-child(3n) { animation-delay: .17s; }
        .rescue-wave span:nth-child(3n + 1) { animation-delay: .34s; }
        @media (prefers-reduced-motion: reduce) {
          .allma-rescue *, .allma-rescue *::before, .allma-rescue *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-[1120px]">
        <header className="mb-5 flex items-center justify-between gap-3 px-1 sm:mb-7">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[15px] border border-[#68d5ac]/20 bg-[#14382d]/70 text-[#8ce7c2] shadow-[0_8px_26px_rgba(0,0,0,.2)]">
              <ShieldCheck className="h-[19px] w-[19px]" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <p className="font-display text-[18px] font-bold leading-tight tracking-[-.04em] text-[#effaf5]">allma<span className="text-[#73d9b3]">.</span></p>
              <p className="mt-0.5 text-[10px] font-medium tracking-[.1em] text-[#829d91]">COMMUNITY SAFETY</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#e97872]/20 bg-[#341c1b]/60 px-3 py-1.5 text-[10px] font-bold tracking-[.11em] text-[#ffaaa2]">
            <span className="relative flex h-2 w-2"><span className="absolute h-full w-full rounded-full bg-[#f47770] opacity-40 rescue-breathe" /><span className="relative m-auto h-1.5 w-1.5 rounded-full bg-[#ff786f]" /></span>
            SOS ACTIVE
          </div>
        </header>

        <section aria-label="Emergency rescue hub" className="overflow-hidden rounded-[27px] border border-white/[.1] bg-[linear-gradient(145deg,rgba(25,48,39,.96),rgba(13,27,23,.97)_38%,rgba(13,24,22,.97))] shadow-[0_30px_100px_rgba(0,0,0,.42),inset_0_1px_0_rgba(255,255,255,.07)] backdrop-blur-2xl">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.08] px-4 py-4 sm:px-7 sm:py-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-[#df8274]/20 bg-[#3b2423]/60 text-[#ed9c8f]">
                    <Radio className="h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="font-display text-[16px] font-semibold tracking-[-.025em] text-[#f1f8f4] sm:text-[18px]">Emergency rescue room</h1>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#8ea69b]"><MapPin className="h-3 w-3 text-[#70cda7]" />Kampala · location shared · 5 trusted people</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-white/[.08] bg-black/15 px-2.5 py-1.5 text-[10px] font-medium text-[#b7c9c0]">
                  <Users className="h-3.5 w-3.5 text-[#7eaa95]" />Private room
                </div>
              </div>

              <section aria-label="Emergency call status" className="relative mx-3 mt-3 overflow-hidden rounded-[21px] border border-[#62d8a8]/20 bg-[linear-gradient(120deg,rgba(22,67,50,.55),rgba(14,39,31,.76)_55%,rgba(17,34,29,.78))] p-4 shadow-[0_12px_40px_rgba(7,28,20,.24)] sm:mx-5 sm:mt-5 sm:p-5">
                <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[#45c894]/[.055] blur-2xl" />
                {callState === "connected" ? (
                  <div className="relative">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative">
                          <InitialAvatar initials="SN" tone="from-[#51d4a5] to-[#1b8069]" size="h-12 w-12" />
                          <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full border-2 border-[#17352a] bg-[#65d9aa] text-[#0b271d]"><Check className="h-2.5 w-2.5" strokeWidth={3} /></span>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold tracking-[-.015em] text-[#f1faf5]">Sarah Namusoke</p>
                          <p className="mt-0.5 text-[11px] text-[#9bb8aa]">Sister · primary responder</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-full border border-[#68dbad]/25 bg-[#62d7a8]/[.09] px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[.13em] text-[#8ce8c2]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#65dfb0] shadow-[0_0_11px_rgba(101,223,176,.8)]" />Connected
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-3 rounded-[15px] border border-white/[.07] bg-[#081a14]/45 px-3 py-2.5 sm:gap-4 sm:px-4">
                      <div className="min-w-[57px]">
                        <p className="font-mono text-[21px] font-medium tabular-nums tracking-[-.05em] text-[#edfaf3]">{time}</p>
                        <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[.13em] text-[#83a393]">Call time</p>
                      </div>
                      <div className="h-8 w-px bg-white/10" />
                      <div className="min-w-0 flex-1">
                        <div className="rescue-wave flex items-center gap-3">
                          <AudioLines className="h-4 w-4 shrink-0 text-[#71dcb1]" />
                          <span className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5" aria-label="Live five-bar voice waveform">
                            {[12, 22, 16, 27, 14].map((height, index) => (
                              <span key={index} className="w-[3px] rounded-full bg-[#65dfb0]" style={{ height }} />
                            ))}
                          </span>
                        </div>
                        <p className="mt-0.5 pl-7 text-[9px] text-[#78998a]">Secure voice connection</p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button type="button" aria-pressed={muted} onClick={() => setMuted((value) => !value)} className={`group flex h-10 min-w-[82px] items-center justify-center gap-2 rounded-[13px] border px-3 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79e0b5] ${muted ? "border-[#8eb5a1]/30 bg-[#ffffff]/10 text-[#e0eee7]" : "border-white/[.09] bg-[#0b2018]/55 text-[#bbd0c5] hover:bg-white/[.09]"}`}>
                          {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}{muted ? "Muted" : "Mute"}
                        </button>
                        <button type="button" aria-pressed={speaker} onClick={() => setSpeaker((value) => !value)} className={`flex h-10 min-w-[94px] items-center justify-center gap-2 rounded-[13px] border px-3 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79e0b5] ${speaker ? "border-white/[.09] bg-[#0b2018]/55 text-[#bbd0c5] hover:bg-white/[.09]" : "border-[#8eb5a1]/30 bg-[#ffffff]/10 text-[#e0eee7]"}`}>
                          {speaker ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}{speaker ? "Speaker" : "Earpiece"}
                        </button>
                      </div>
                      <button type="button" onClick={() => setCallState("ended")} aria-label="End call" className="grid h-10 w-[52px] shrink-0 place-items-center rounded-[13px] border border-[#f48177]/25 bg-[#a8413c] text-white shadow-[0_6px_20px_rgba(151,46,42,.22)] transition-colors hover:bg-[#bc4f48] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffaaa2]">
                        <PhoneOff className="h-[17px] w-[17px]" />
                      </button>
                    </div>
                  </div>
                ) : callState === "dialing" ? (
                  <div className="relative">
                    <div className="flex items-center gap-4">
                      <div className="relative grid h-[68px] w-[68px] shrink-0 place-items-center">
                        <span className="rescue-radar-ring absolute inset-0 rounded-full border border-[#74e0b4]/40" />
                        <span className="absolute inset-[8px] rounded-full border border-[#74e0b4]/25" />
                        <span className="absolute inset-[17px] rounded-full border border-[#74e0b4]/20" />
                        <span className="relative grid h-9 w-9 place-items-center rounded-full bg-[#51bf8f]/20 text-[#9bf0c9]"><Signal className="h-4 w-4" /></span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-[15px] font-semibold tracking-[-.025em] text-[#edfaf3]">Calling Safety Network (3/5 alerted)…</p>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-[#a3bdb0]">Your trusted responders are being reached now.</p>
                        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[.09]"><div className="h-full w-[60%] rounded-full bg-gradient-to-r from-[#52bb8e] to-[#a5edc8]" /></div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[.08] pt-3">
                      <span className="flex items-center gap-2 text-[10px] text-[#8ca99a]"><span className="h-1.5 w-1.5 rounded-full bg-[#87dcb3] rescue-breathe" />Dialing continues in the background</span>
                      <button type="button" onClick={() => setCallState("ended")} className="flex h-9 shrink-0 items-center gap-2 rounded-[12px] border border-[#f48177]/25 bg-[#a8413c] px-3 text-[10px] font-semibold text-white hover:bg-[#bc4f48] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffaaa2]"><PhoneOff className="h-3.5 w-3.5" />End</button>
                    </div>
                  </div>
                ) : (
                  <div className="relative flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-white/[.06] text-[#a7bcb1]"><PhoneOff className="h-4 w-4" /></span>
                      <div><p className="text-[13px] font-semibold text-[#e5f0ea]">Call ended</p><p className="mt-1 text-[10px] text-[#8ea69a]">Your SOS room is still open.</p></div>
                    </div>
                    <button type="button" onClick={() => setCallState("dialing")} className="flex h-9 items-center gap-2 rounded-[12px] border border-[#70dcb0]/25 bg-[#4bc28d]/10 px-3 text-[11px] font-semibold text-[#9ce6c3] hover:bg-[#4bc28d]/20"><Phone className="h-3.5 w-3.5" />Reconnect</button>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[.08] pt-3">
                  <button type="button" onClick={() => setRosterOpen((value) => !value)} aria-expanded={rosterOpen} className="flex min-h-8 items-center gap-2 rounded-lg px-1 text-[11px] font-medium text-[#b3c9bd] transition-colors hover:text-[#e6f5ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79e0b5]">
                    <Users className="h-3.5 w-3.5 text-[#81c9a7]" />
                    <span>{callState === "dialing" ? "5 people alerted" : "Safety network · 5 people"}</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${rosterOpen ? "rotate-180" : ""}`} />
                  </button>
                  <div className="flex items-center gap-1.5 text-[9px] font-medium text-[#7f9a8c]"><Clock3 className="h-3 w-3" />Updates as responders reply</div>
                </div>
                {rosterOpen && (
                  <div className="mt-2 grid gap-1.5 border-t border-white/[.07] pt-2 sm:grid-cols-2">
                    {roster.map((person) => (
                      <div key={person.name} className="flex min-w-0 items-center gap-2.5 rounded-[12px] border border-white/[.055] bg-[#091b14]/40 px-2.5 py-2">
                        <InitialAvatar initials={person.initials} tone={person.tone} size="h-8 w-8" />
                        <div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold text-[#e0ece5]">{person.name}</p><p className="truncate text-[9px] text-[#819b8d]">{person.relation}</p></div>
                        <span className={`shrink-0 rounded-full border px-2 py-1 text-[8px] font-bold uppercase tracking-[.08em] ${person.status === "Connected" ? "border-[#61d7a5]/20 bg-[#54c794]/10 text-[#8ee6bd]" : person.status === "Calling" ? "border-[#e7bf70]/20 bg-[#d7a84f]/10 text-[#e4c37f]" : person.status === "Notified" ? "border-[#96b7d2]/15 bg-[#7099b5]/10 text-[#adc4d4]" : "border-white/[.08] bg-white/[.04] text-[#a0b2a8]"}`}>{person.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div className="px-4 pb-4 pt-5 sm:px-7 sm:pb-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div><h2 className="text-[12px] font-semibold tracking-[.015em] text-[#dcebe3]">Room messages</h2><p className="mt-1 text-[10px] text-[#829b8e]">Only you and your trusted people</p></div>
                  <span className="flex items-center gap-1.5 rounded-full border border-[#6dcc9f]/15 bg-[#24533e]/20 px-2.5 py-1 text-[9px] font-semibold text-[#91c9aa]"><span className="h-1.5 w-1.5 rounded-full bg-[#78d8a9]" />Live</span>
                </div>

                <div ref={scrollRef} className="max-h-[340px] min-h-[206px] space-y-4 overflow-y-auto pr-1 [scrollbar-color:rgba(118,154,135,.32)_transparent] [scrollbar-width:thin]">
                  <div className="flex items-center gap-3 py-1"><span className="h-px flex-1 bg-white/[.07]" /><span className="text-[9px] font-semibold uppercase tracking-[.14em] text-[#718b7e]">Today · 8:42 PM</span><span className="h-px flex-1 bg-white/[.07]" /></div>
                  {messages.map((item) => (
                    <div key={item.id} className={`flex items-end gap-2.5 ${item.mine ? "flex-row-reverse" : ""}`}>
                      <InitialAvatar initials={item.initials} tone={item.tone} size="h-8 w-8" />
                      <div className={`min-w-0 max-w-[86%] sm:max-w-[78%] ${item.mine ? "text-right" : ""}`}>
                        <div className={`mb-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[9px] ${item.mine ? "justify-end" : ""}`}>
                          <span className="font-semibold text-[#cfdfd5]">{item.name} ({item.role})</span><span className="text-[#789285]">· {item.time}</span>
                        </div>
                        {item.voice ? (
                          <div className="flex min-w-[220px] max-w-[300px] items-center gap-2 rounded-[15px] rounded-bl-[5px] border border-[#5fc79a]/15 bg-[#172f26]/80 px-3 py-2">
                            <button type="button" onClick={() => setVoicePlaying((value) => !value)} aria-label={voicePlaying ? "Pause voice note" : "Play voice note"} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#72d9ab]/20 bg-[#55c28f]/10 text-[#9de7c3] hover:bg-[#55c28f]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79e0b5]">
                              {voicePlaying ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />}
                            </button>
                            <Waveform compact playing={voicePlaying} />
                            <span className="font-mono text-[9px] tabular-nums text-[#a0b9ab]">{item.voice}</span>
                          </div>
                        ) : (
                          <p className={`rounded-[15px] px-3.5 py-2.5 text-left text-[12px] leading-[1.65] ${item.mine ? "rounded-br-[5px] border border-[#d5a47a]/15 bg-[#392e25]/80 text-[#f1e5d9]" : "rounded-bl-[5px] border border-white/[.07] bg-[#172820]/90 text-[#d9e6de]"}`}>{item.text}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 border-t border-white/[.07] pt-4">
                  <form onSubmit={sendMessage} className="flex items-center gap-2 rounded-[15px] border border-white/[.1] bg-[#081812]/65 p-1.5 pl-3 transition-colors focus-within:border-[#65d4a6]/40 focus-within:bg-[#0c1d16]">
                    <input ref={messageInput} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message your responders…" aria-label="Message your responders" className="h-10 min-w-0 flex-1 bg-transparent text-[12px] text-[#e4f0e9] outline-none placeholder:text-[#718a7d]" />
                    <button type="submit" disabled={!message.trim()} aria-label="Send message" className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[#67d4a4] text-[#092116] transition-colors hover:bg-[#8be6bd] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d0ffe5]"><Send className="h-4 w-4" /></button>
                  </form>
                  <p className="mt-2 px-1 text-[9px] text-[#718a7d]">Your message goes to everyone in this private room.</p>
                </div>
              </div>
            </div>

            <aside className="border-t border-white/[.08] bg-[#091711]/45 p-4 sm:p-5 lg:border-l lg:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#7f9d8d]">Direct lines</p><h2 className="mt-1.5 font-display text-[15px] font-semibold tracking-[-.02em] text-[#e7f2eb]">Help is one tap away</h2></div>
                <span className="grid h-8 w-8 place-items-center rounded-[11px] border border-[#e37d72]/15 bg-[#442722]/35 text-[#e59385]"><Phone className="h-3.5 w-3.5" /></span>
              </div>
              <div className="mt-4 space-y-2">
                <a href="tel:999" className="group flex min-h-[56px] items-center gap-3 rounded-[15px] border border-[#e07c72]/20 bg-[#3d2421]/55 px-3.5 transition-colors hover:border-[#e07c72]/40 hover:bg-[#472824]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffaaa2]">
                  <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#b64e46]/15 text-[#f19a8f]"><Phone className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold text-[#f0d9d3]">Police</span><span className="mt-0.5 block text-[10px] text-[#aa8279]">Emergency response</span></span><span className="font-mono text-[14px] font-semibold tracking-[.04em] text-[#ffc0b5]">999</span>
                </a>
                <a href="tel:112" className="group flex min-h-[56px] items-center gap-3 rounded-[15px] border border-[#d7b166]/16 bg-[#3a3320]/40 px-3.5 transition-colors hover:border-[#d7b166]/35 hover:bg-[#423a25]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8c77e]">
                  <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#cba653]/10 text-[#e0c078]"><Phone className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold text-[#ebe2c9]">Toll-free</span><span className="mt-0.5 block text-[10px] text-[#9f9475]">National emergency line</span></span><span className="font-mono text-[14px] font-semibold tracking-[.04em] text-[#ead396]">112</span>
                </a>
                <a href="tel:911" className="flex min-h-10 items-center justify-between rounded-[13px] border border-white/[.07] bg-white/[.025] px-3.5 text-[10px] text-[#a1b5a9] transition-colors hover:bg-white/[.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79e0b5]"><span>Alternate emergency line</span><span className="font-mono font-semibold text-[#d5e1da]">911 <span className="text-[#81998b]">↗</span></span></a>
              </div>

              <div className="mt-5 rounded-[16px] border border-[#75d5aa]/10 bg-[#173529]/35 p-3.5">
                <div className="flex items-center gap-2 text-[#94dfb8]"><ShieldCheck className="h-4 w-4" /><span className="text-[10px] font-semibold">Your room is private</span></div>
                <p className="mt-2 text-[10px] leading-[1.65] text-[#8aa496]">Only the trusted people in your Safety Network can see these messages and your shared location.</p>
              </div>

              <div className="mt-5 border-t border-white/[.07] pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-[9px] font-bold uppercase tracking-[.14em] text-[#819b8e]">Prototype controls</p><p className="mt-1 text-[9px] text-[#667f72]">Demo only · not in production</p></div>
                  <div className="flex rounded-[11px] border border-white/[.09] bg-[#07140f]/70 p-1" role="group" aria-label="Prototype call state">
                    <button type="button" aria-pressed={callState === "dialing"} onClick={() => setCallState("dialing")} className={`rounded-[8px] px-2 py-1.5 text-[9px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79e0b5] ${callState === "dialing" ? "bg-[#28543e] text-[#c5f4d8]" : "text-[#7e9588] hover:text-[#d8e6dd]"}`}>Dialing</button>
                    <button type="button" aria-pressed={callState === "connected"} onClick={() => setCallState("connected")} className={`rounded-[8px] px-2 py-1.5 text-[9px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79e0b5] ${callState === "connected" ? "bg-[#28543e] text-[#c5f4d8]" : "text-[#7e9588] hover:text-[#d8e6dd]"}`}>Connected</button>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>
        <p className="mt-4 px-1 text-center text-[9px] tracking-[.04em] text-[#5f776a]">Allma connects you with people you trust when every moment matters.</p>
      </div>
    </main>
  );
}
