import { useMemo, useState } from "react";
import {
  Ambulance,
  ArrowUpRight,
  BadgeCheck,
  BellRing,
  Check,
  CheckCircle2,
  Clock3,
  Flame,
  Headphones,
  MapPin,
  MessageCircle,
  Mic,
  MicOff,
  Navigation,
  Phone,
  PhoneCall,
  PhoneOff,
  Radio,
  ShieldAlert,
  Siren,
  Speaker,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatDistance,
  rankEmergencyContacts,
  shouldEscalateOfficially,
  type EmergencyCategory,
  type EmergencyCommandState,
} from "@/lib/emergency-communication";
import { demoVoiceProvider } from "@/lib/voice-provider";

type ViewMode = "responder" | "citizen";
type CallStatus = "ringing" | "connected" | "ended";
type ResponderStatus = "accepted" | "en_route" | "arrived" | "completed";

const responder = {
  id: "responder-sarah",
  name: "Sarah Namusoke",
  initials: "SN",
  role: "Verified First Aider",
  distanceMeters: 420,
  verified: true,
};

const candidatePreview = rankEmergencyContacts({
  category: "medical",
  severity: "critical",
  immediateDanger: true,
  citizenCircleIds: ["responder-sarah"],
  candidates: [
    {
      id: responder.id,
      name: responder.name,
      distanceMeters: responder.distanceMeters,
      skills: ["medical"],
      verified: responder.verified,
      available: true,
      optedIn: true,
      emergencyPermissions: true,
      blocked: false,
      handlingAnotherEmergency: false,
      locationFresh: true,
    },
  ],
});

const timeline = [
  { time: "13:41", label: "SOS activated", tone: "red" },
  { time: "13:41", label: "Location acquired · 14m accuracy", tone: "blue" },
  { time: "13:42", label: "Medical emergency identified", tone: "violet" },
  { time: "13:42", label: "Sarah selected as potential responder", tone: "amber" },
  { time: "13:42", label: "In-app emergency call initiated", tone: "red" },
];

const statusCopy: Record<ResponderStatus, { label: string; detail: string }> = {
  accepted: { label: "Accepted", detail: "Sarah has accepted your emergency request." },
  en_route: { label: "On the way", detail: "Sarah is travelling to the approximate location." },
  arrived: { label: "Arrived", detail: "Sarah marked that she has arrived." },
  completed: { label: "Completed", detail: "Assistance was marked complete." },
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/65">
      {children}
    </p>
  );
}

function StatusPill({
  children,
  tone = "blue",
}: {
  children: React.ReactNode;
  tone?: "blue" | "red" | "green" | "amber";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
        tone === "red" && "bg-destructive/12 text-destructive",
        tone === "blue" && "bg-primary/10 text-primary",
        tone === "green" && "bg-success/12 text-success",
        tone === "amber" && "bg-gold/14 text-gold",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "red"
            ? "bg-destructive"
            : tone === "green"
              ? "bg-success"
              : tone === "amber"
                ? "bg-gold"
                : "bg-primary",
        )}
      />
      {children}
    </span>
  );
}

export function EmergencyCallsWorkspace() {
  const [view, setView] = useState<ViewMode>("responder");
  const [callStatus, setCallStatus] = useState<CallStatus>("ringing");
  const [responderStatus, setResponderStatus] = useState<ResponderStatus>("accepted");
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([
    { author: "system", text: "Allma created a secure emergency conversation." },
    { author: "Sarah", text: "I’m on my way. Please stay where you are." },
  ]);

  const isConnected = callStatus === "connected";
  const currentStatus = statusCopy[responderStatus];
  const officialEscalation = shouldEscalateOfficially("medical", "critical", true);
  const commandState: EmergencyCommandState =
    responderStatus === "arrived"
      ? "RESPONDER_ARRIVED"
      : responderStatus === "en_route"
        ? "RESPONDER_EN_ROUTE"
        : isConnected
          ? "RESPONDER_ACCEPTED"
          : "CONTACTING";

  const queue = useMemo(
    () => [
      {
        name: "Sarah · Verified first aider",
        status: isConnected ? "Connected" : "Calling",
        tone: isConnected ? "green" : "red",
      },
      { name: "David · Trusted family", status: "Queued", tone: "amber" },
      {
        name: "Ambulance · Official option",
        status: officialEscalation ? "Pending user tap" : "Standby",
        tone: "blue",
      },
    ],
    [isConnected, officialEscalation],
  );

  async function acceptCall() {
    await demoVoiceProvider.acceptCall({ callId: "ASA-000128" });
    setCallStatus("connected");
    setChat((items) => [
      ...items,
      {
        author: "system",
        text: "Demo call connected. No microphone or real recipient is connected.",
      },
    ]);
  }

  function sendMessage() {
    const next = message.trim();
    if (!next) return;
    setChat((items) => [...items, { author: "You", text: next }]);
    setMessage("");
  }

  function updateResponderStatus(next: ResponderStatus) {
    setResponderStatus(next);
    setChat((items) => [
      ...items,
      { author: "system", text: `Responder status updated: ${statusCopy[next].label}.` },
    ]);
  }

  return (
    <div className="relative min-h-[calc(100dvh-4rem)] overflow-hidden">
      <div className="signal-streak pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-auto w-full max-w-7xl px-4 pb-8 pt-5 sm:px-6 lg:px-10 lg:pt-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Siren className="h-4 w-4 text-destructive" />
              <SectionLabel>Emergency communication</SectionLabel>
              <StatusPill tone="amber">Demo call mode</StatusPill>
            </div>
            <h1 className="font-display text-2xl font-black tracking-[-0.03em] lg:text-4xl">
              Emergency calls
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              A consent-based in-app coordination layer for trusted contacts and opted-in
              responders. Official assistance is never implied until it is actually confirmed.
            </p>
          </div>
          <div className="flex rounded-2xl border border-border/60 bg-card/70 p-1">
            {(["responder", "citizen"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={cn(
                  "rounded-xl px-3.5 py-2 text-[12px] font-semibold capitalize transition-colors",
                  view === mode
                    ? "bg-primary text-primary-foreground shadow-soft"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {mode} view
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
          <div className="space-y-5">
            <motion.section
              layout
              className="overflow-hidden rounded-[2rem] border border-destructive/25 bg-card/85 shadow-lift backdrop-blur-xl"
            >
              <div className="border-b border-border/50 bg-destructive/[0.04] px-5 py-4 sm:px-7">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-destructive to-orange-500 text-white shadow-lg shadow-destructive/20">
                      {view === "responder" ? (
                        <BellRing className="h-5 w-5" />
                      ) : (
                        <ShieldAlert className="h-5 w-5" />
                      )}
                      {callStatus === "ringing" && (
                        <span className="absolute -inset-1 animate-ping rounded-2xl border border-destructive/50" />
                      )}
                    </div>
                    <div>
                      <p className="font-display text-lg font-black">
                        {view === "responder" ? "Emergency assistance call" : "Emergency active"}
                      </p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {view === "responder"
                          ? "Sarah may need your help"
                          : `Connected to ${responder.name}`}
                      </p>
                    </div>
                  </div>
                  <StatusPill tone={isConnected ? "green" : "red"}>
                    {isConnected ? "Connected" : "Calling"}
                  </StatusPill>
                </div>
              </div>

              <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_1.2fr]">
                <div className="flex flex-col items-center justify-center rounded-[1.6rem] border border-border/50 bg-background/45 p-6 text-center">
                  <div className="relative grid h-28 w-28 place-items-center rounded-full bg-gradient-to-br from-primary/20 via-primary/8 to-transparent ring-1 ring-primary/20">
                    <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow font-display text-xl font-black text-primary-foreground shadow-lift">
                      {responder.initials}
                    </div>
                    <span className="absolute bottom-1 right-1 grid h-7 w-7 place-items-center rounded-full border-4 border-card bg-success text-white">
                      <BadgeCheck className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <h2 className="mt-4 font-display text-xl font-black">{responder.name}</h2>
                  <p className="mt-1 text-[12px] text-muted-foreground">{responder.role}</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Badge variant="secondary" className="rounded-full">
                      <MapPin className="mr-1 h-3 w-3" />
                      {formatDistance(responder.distanceMeters)} away
                    </Badge>
                    <Badge variant="outline" className="rounded-full">
                      <Radio className="mr-1 h-3 w-3 text-success" />
                      Location shared by permission
                    </Badge>
                  </div>
                  <div className="mt-5 text-center">
                    <p className="font-mono text-2xl font-bold tabular-nums">
                      {isConnected ? "00:48" : "— — : — —"}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      call duration
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-border/50 bg-secondary/35 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <SectionLabel>AI responder summary</SectionLabel>
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-primary">
                        AI assisted
                      </span>
                    </div>
                    <p className="text-[13px] leading-relaxed text-foreground/85">
                      Medical emergency. Citizen reports an unconscious adult. Location acquired
                      with
                      <span className="font-semibold text-foreground"> 14m accuracy</span>. Citizen
                      is currently with the patient.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <InfoCell
                      icon={ShieldAlert}
                      label="Emergency"
                      value="Medical · Critical"
                      tone="red"
                    />
                    <InfoCell icon={MapPin} label="Location" value="Approx. 420m" tone="blue" />
                    <InfoCell
                      icon={Clock3}
                      label="State"
                      value={commandState.replaceAll("_", " ")}
                      tone="amber"
                    />
                    <InfoCell
                      icon={Radio}
                      label="Connection"
                      value={isConnected ? "Secure demo" : "Awaiting response"}
                      tone="green"
                    />
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    {view === "responder" && !isConnected ? (
                      <>
                        <Button
                          onClick={acceptCall}
                          className="h-11 flex-1 rounded-2xl bg-success text-white hover:bg-success/90"
                        >
                          <PhoneCall className="mr-1.5 h-4 w-4" /> Accept
                        </Button>
                        <Button
                          onClick={() => setCallStatus("ended")}
                          variant="outline"
                          className="h-11 flex-1 rounded-2xl border-destructive/30 text-destructive hover:bg-destructive/5"
                        >
                          <PhoneOff className="mr-1.5 h-4 w-4" /> Decline
                        </Button>
                      </>
                    ) : (
                      <>
                        <ControlButton
                          active={muted}
                          onClick={() => setMuted((value) => !value)}
                          icon={muted ? MicOff : Mic}
                          label={muted ? "Unmute" : "Mute"}
                        />
                        <ControlButton
                          active={speaker}
                          onClick={() => setSpeaker((value) => !value)}
                          icon={Speaker}
                          label="Speaker"
                        />
                        <ControlButton
                          onClick={() => setChatOpen((value) => !value)}
                          icon={MessageCircle}
                          label="Chat"
                        />
                        <ControlButton
                          onClick={() => setCallStatus("ended")}
                          icon={PhoneOff}
                          label="End"
                          danger
                        />
                      </>
                    )}
                  </div>
                  {view === "responder" && !isConnected && (
                    <p className="text-center text-[10.5px] leading-relaxed text-muted-foreground/70">
                      Before acceptance, only the emergency category, approximate distance and
                      role-relevant summary are shown.
                    </p>
                  )}
                </div>
              </div>
              {callStatus === "ended" && (
                <div className="border-t border-border/50 bg-secondary/25 px-5 py-4 text-center text-[12px] text-muted-foreground">
                  This demo call ended. The SOS session remains independent and can still be
                  escalated.
                </div>
              )}
            </motion.section>

            {isConnected && (
              <section className="rounded-[1.7rem] border border-border/60 bg-card/80 p-5 shadow-soft sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <SectionLabel>Responder progress</SectionLabel>
                    <h2 className="mt-1 font-display text-lg font-black">{currentStatus.label}</h2>
                  </div>
                  <StatusPill tone={responderStatus === "completed" ? "green" : "blue"}>
                    {currentStatus.label}
                  </StatusPill>
                </div>
                <p className="mt-2 text-[12.5px] text-muted-foreground">{currentStatus.detail}</p>
                <div className="mt-5 grid grid-cols-4 gap-2">
                  {(["accepted", "en_route", "arrived", "completed"] as const).map(
                    (step, index) => {
                      const active =
                        (["accepted", "en_route", "arrived", "completed"] as const).indexOf(
                          responderStatus,
                        ) >= index;
                      return (
                        <button
                          key={step}
                          type="button"
                          onClick={() => updateResponderStatus(step)}
                          className={cn(
                            "group text-left",
                            active ? "text-primary" : "text-muted-foreground/50",
                          )}
                        >
                          <div
                            className={cn(
                              "mb-2 h-1.5 rounded-full",
                              active ? "bg-primary" : "bg-muted",
                            )}
                          />
                          <p className="text-[10px] font-bold capitalize">
                            {step.replace("_", " ")}
                          </p>
                        </button>
                      );
                    },
                  )}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="outline" className="rounded-xl text-xs">
                    <Navigation className="mr-1.5 h-3.5 w-3.5" /> Navigate
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-xl text-xs"
                    onClick={() => setChatOpen(true)}
                  >
                    <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Secure chat
                  </Button>
                  <Button variant="outline" className="rounded-xl text-xs">
                    <MapPin className="mr-1.5 h-3.5 w-3.5" /> View map
                  </Button>
                </div>
              </section>
            )}
          </div>

          <div className="space-y-5">
            <section className="rounded-[1.7rem] border border-border/60 bg-card/80 p-5 shadow-soft sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <SectionLabel>Call queue · ASA-000128</SectionLabel>
                  <h2 className="mt-1 font-display text-lg font-black">Intelligent escalation</h2>
                </div>
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10">
                  <Users className="h-4 w-4 text-primary" />
                </span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                Eligible contacts are ranked by permission, availability, skills, verification and
                fresh location.
              </p>
              <div className="mt-5 space-y-2.5">
                {queue.map((item, index) => (
                  <div
                    key={item.name}
                    className="flex items-center gap-3 rounded-2xl border border-border/45 bg-background/45 p-3"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-black">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold">{item.name}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {index === 0 ? candidatePreview[0]?.reason : "Waiting for first acceptance"}
                      </p>
                    </div>
                    <StatusPill tone={item.tone as "blue" | "red" | "green" | "amber"}>
                      {item.status}
                    </StatusPill>
                  </div>
                ))}
              </div>
              {officialEscalation && (
                <div className="mt-4 flex gap-2.5 rounded-2xl border border-destructive/20 bg-destructive/5 p-3.5">
                  <Ambulance className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    <span className="font-bold text-foreground">Critical rule:</span> official
                    assistance remains a primary option. Allma has not called an official service;
                    use the device call action when ready.
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-[1.7rem] border border-border/60 bg-card/80 p-5 shadow-soft sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <SectionLabel>Emergency timeline</SectionLabel>
                  <h2 className="mt-1 font-display text-lg font-black">Coordination history</h2>
                </div>
                <Clock3 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-5 space-y-4">
                {[
                  ...timeline,
                  ...(isConnected
                    ? [
                        {
                          time: "13:43",
                          label: "Sarah accepted · demo call connected",
                          tone: "green",
                        },
                      ]
                    : []),
                ].map((event, index) => (
                  <div key={`${event.time}-${event.label}`} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          "mt-1.5 h-2 w-2 rounded-full",
                          event.tone === "red"
                            ? "bg-destructive"
                            : event.tone === "green"
                              ? "bg-success"
                              : event.tone === "amber"
                                ? "bg-gold"
                                : "bg-primary",
                        )}
                      />
                      {index < timeline.length - 1 && (
                        <span className="mt-1 h-full w-px bg-border" />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                      <p className="text-[12px] leading-relaxed">{event.label}</p>
                      <time className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {event.time}
                      </time>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-2 rounded-xl bg-secondary/45 px-3 py-2.5 text-[10.5px] text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Events are audit-ready and
                visible only to authorized participants.
              </div>
            </section>

            {chatOpen && (
              <section className="rounded-[1.7rem] border border-border/60 bg-card/80 p-5 shadow-soft sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <SectionLabel>Secure emergency chat</SectionLabel>
                    <h2 className="mt-1 font-display text-lg font-black">Coordination messages</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChatOpen(false)}
                    className="text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4 space-y-2.5">
                  {chat.map((item, index) => (
                    <div
                      key={`${item.author}-${index}`}
                      className={cn(
                        "max-w-[90%] rounded-2xl px-3.5 py-2.5 text-[12px]",
                        item.author === "system"
                          ? "bg-secondary/60 text-muted-foreground"
                          : item.author === "You"
                            ? "ml-auto bg-primary text-primary-foreground"
                            : "bg-primary/8 text-foreground",
                      )}
                    >
                      <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider opacity-60">
                        {item.author}
                      </span>
                      {item.text}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <input
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && sendMessage()}
                    placeholder="Send a safety update..."
                    className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                  />
                  <Button size="icon" className="rounded-xl" onClick={sendMessage}>
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-3 text-[10px] text-muted-foreground/70">
                  Messages are labelled as user, system or AI events. Calls are not recorded.
                </p>
              </section>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-secondary/25 px-4 py-3 text-[10.5px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <Headphones className="h-3.5 w-3.5 text-primary" /> WebRTC / STUN / TURN integration
            boundary ready · no provider configured
          </span>
          <span className="font-semibold uppercase tracking-widest text-gold">
            DEMO · no real call occurred
          </span>
        </div>
      </div>
    </div>
  );
}

function InfoCell({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
  tone: "red" | "blue" | "green" | "amber";
}) {
  return (
    <div className="rounded-2xl border border-border/45 bg-secondary/25 p-3">
      <Icon
        className={cn(
          "mb-2 h-3.5 w-3.5",
          tone === "red"
            ? "text-destructive"
            : tone === "green"
              ? "text-success"
              : tone === "amber"
                ? "text-gold"
                : "text-primary",
        )}
      />
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-[11px] font-semibold capitalize">{value}</p>
    </div>
  );
}

function ControlButton({
  icon: Icon,
  label,
  onClick,
  active,
  danger,
}: {
  icon: typeof Mic;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "grid min-w-16 place-items-center gap-1 rounded-2xl border px-3 py-2.5 text-[10px] font-semibold transition-colors",
        danger
          ? "border-destructive/25 text-destructive hover:bg-destructive/5"
          : active
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
