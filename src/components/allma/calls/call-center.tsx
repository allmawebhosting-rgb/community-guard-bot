import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  MapPin,
  Mic,
  MicOff,
  Network,
  Phone,
  PhoneOff,
  ShieldCheck,
  TriangleAlert,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { notifyIncomingCall } from "@/lib/push.functions";
import { Avatar } from "@/components/allma/safety-network/add-safety-contact";
import { getEmergencyCallContext, type EmergencyCallContext } from "@/lib/sos-calling";
import { startSosEmergencyCall } from "@/lib/sos-calling";
import {
  VoiceCallEngine,
  formatDuration,
  microphoneErrorMessage,
  onVoiceCallRequest,
  setCallStatus,
  startVoiceCall,
  type CallPeer,
  type ConnectionQuality,
} from "@/lib/voice-call";

type Phase = "idle" | "outgoing" | "incoming" | "active" | "ended";

const RING_TIMEOUT_MS = 45_000;

const qualityCopy: Record<ConnectionQuality, string> = {
  connecting: "Connecting…",
  good: "Connected",
  poor: "Poor connection",
  reconnecting: "Reconnecting…",
};

export function CallCenter() {
  const [userId, setUserId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [peer, setPeer] = useState<CallPeer | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [isCaller, setIsCaller] = useState(false);
  const [quality, setQuality] = useState<ConnectionQuality>("connecting");
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [endedNote, setEndedNote] = useState<string | null>(null);
  const [relay, setRelay] = useState<boolean | null>(null);

  const engineRef = useRef<VoiceCallEngine | null>(null);
  const callIdRef = useRef<string | null>(null);
  const namesRef = useRef<Map<string, CallPeer>>(new Map());
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teardown = useCallback((note: string | null) => {
    engineRef.current?.close();
    engineRef.current = null;
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    ringTimerRef.current = null;
    callIdRef.current = null;
    setCallId(null);
    setSeconds(0);
    setMuted(false);
    setQuality("connecting");
    setEndedNote(note);
    setRelay(null);
    setPhase(note ? "ended" : "idle");
    if (note) setTimeout(() => setPhase((current) => (current === "ended" ? "idle" : current)), 2600);
  }, []);

  // Identity + safety-network name lookup (calls only exist between connections).
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setUserId(data.user?.id ?? null);
      if (!data.user) return;
      const { data: connections } = await supabase.rpc("list_safety_connections");
      if (!active) return;
      const map = new Map<string, CallPeer>();
      for (const connection of connections ?? []) {
        map.set(connection.member_id, {
          id: connection.member_id,
          name: connection.full_name,
          avatarUrl: connection.avatar_url,
        });
      }
      namesRef.current = map;
    })();
    return () => {
      active = false;
    };
  }, []);

  const beginEngine = useCallback(
    async (id: string, caller: boolean) => {
      const engine = new VoiceCallEngine(id, userId!, caller, {
        onQuality: setQuality,
        onRelay: setRelay,
        onConnected: () => {
          setQuality("good");
          setPhase("active");
          if (caller) void setCallStatus(id, "connected").catch(() => undefined);
        },
        onFailed: (message) => {
          void setCallStatus(id, "failed", message).catch(() => undefined);
          teardown(message);
        },
      });
      engineRef.current = engine;
      await engine.start();
    },
    [teardown, userId],
  );

  // Outgoing call requests from anywhere in the app.
  useEffect(() => {
    return onVoiceCallRequest((requested) => {
      void (async () => {
        if (!userId) {
          toast.error("Sign in to make an Allma call.");
          return;
        }
        if (callIdRef.current) {
          toast.error("You are already on a call.");
          return;
        }
        setPeer(requested);
        setIsCaller(true);
        setPhase("outgoing");
        setEndedNote(null);
        setQuality("connecting");
        try {
          const id = await startVoiceCall(requested.id);
          callIdRef.current = id;
          setCallId(id);
          // Best-effort: rings the recipient's device even if their app is closed.
          void notifyIncomingCall({ data: { callId: id } }).catch(() => undefined);
          await beginEngine(id, true);
          ringTimerRef.current = setTimeout(() => {
            void setCallStatus(id, "missed").catch(() => undefined);
            teardown(`${requested.name} did not answer.`);
          }, RING_TIMEOUT_MS);
        } catch (error) {
          const message =
            error instanceof DOMException
              ? microphoneErrorMessage(error)
              : error instanceof Error
                ? error.message
                : "The call could not be placed.";
          if (callIdRef.current) {
            await setCallStatus(callIdRef.current, "failed", message).catch(() => undefined);
          }
          teardown(message);
          toast.error(message);
        }
      })();
    });
  }, [beginEngine, teardown, userId]);

  // Incoming calls + live call state for both sides.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`allma-calls-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "emergency_calls", filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as { id: string; caller_id: string; status: string };
          if (callIdRef.current || row.status === "ended") return;
          const known = namesRef.current.get(row.caller_id);
          callIdRef.current = row.id;
          setCallId(row.id);
          setPeer(known ?? { id: row.caller_id, name: "Allma member" });
          setIsCaller(false);
          setEndedNote(null);
          setPhase("incoming");
          void setCallStatus(row.id, "ringing").catch(() => undefined);
          ringTimerRef.current = setTimeout(() => teardown("Missed call"), RING_TIMEOUT_MS);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "emergency_calls" },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          if (row.id !== callIdRef.current) return;
          if (row.status === "declined") teardown(`${peer?.name ?? "They"} declined the call.`);
          else if (row.status === "ended") teardown("Call ended");
          else if (row.status === "missed") teardown("No answer");
          else if (row.status === "connecting" && phase === "outgoing") setQuality("connecting");
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [peer?.name, phase, teardown, userId]);

  // Call timer starts only when real audio is connected.
  useEffect(() => {
    if (phase !== "active" || quality === "connecting") return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [phase, quality]);

  useEffect(() => () => engineRef.current?.close(), []);

  const answer = async () => {
    const id = callIdRef.current;
    if (!id) return;
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    try {
      await setCallStatus(id, "connecting");
      setPhase("active");
      await beginEngine(id, false);
    } catch (error) {
      const message =
        error instanceof DOMException
          ? microphoneErrorMessage(error)
          : error instanceof Error
            ? error.message
            : "The call could not be answered.";
      await setCallStatus(id, "failed", message).catch(() => undefined);
      teardown(message);
      toast.error(message);
    }
  };

  const decline = async () => {
    const id = callIdRef.current;
    if (!id) return;
    await setCallStatus(id, "declined").catch(() => undefined);
    teardown("Call declined");
  };

  const hangUp = async () => {
    const id = callIdRef.current;
    if (!id) return;
    await setCallStatus(id, "ended").catch(() => undefined);
    teardown("Call ended");
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    engineRef.current?.setMuted(next);
  };

  const toggleSpeaker = () => {
    const next = !speaker;
    setSpeaker(next);
    void engineRef.current?.setSpeaker(next).then((applied) => {
      if (!applied) toast.message("Speaker selection isn't supported on this device.");
    });
  };

  const visible = phase !== "idle";
  const statusLine =
    phase === "outgoing"
      ? `Calling ${peer?.name?.split(" ")[0] ?? "…"}…`
      : phase === "incoming"
        ? "is calling you"
        : phase === "ended"
          ? (endedNote ?? "Call ended")
          : qualityCopy[quality];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex flex-col bg-background/95 backdrop-blur-xl"
          role="dialog"
          aria-label="Allma voice call"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-primary/12 to-transparent" />

          <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
              {phase === "incoming" ? "Allma call" : "Allma voice call"}
            </p>

            <motion.div
              className="mt-8"
              animate={phase === "incoming" || phase === "outgoing" ? { scale: [1, 1.04, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1.8 }}
            >
              <Avatar name={peer?.name ?? "Allma member"} url={peer?.avatarUrl ?? null} size={112} />
            </motion.div>

            <h2 className="mt-6 text-2xl font-bold tracking-tight">{peer?.name ?? "Allma member"}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{statusLine}</p>

            {phase === "active" && quality !== "connecting" && (
              <p className="mt-3 font-mono text-3xl font-semibold tabular-nums">
                {formatDuration(seconds)}
              </p>
            )}

            <p className="mt-8 inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              In-app call · phone numbers stay private
            </p>

            {relay !== null && phase !== "ended" && (
              <p
                className={cn(
                  "mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium",
                  relay ? "text-muted-foreground" : "text-gold",
                )}
              >
                {relay ? (
                  <>
                    <Network className="h-3.5 w-3.5" /> Relay active — works on mobile networks
                  </>
                ) : (
                  <>
                    <Network className="h-3.5 w-3.5" /> Direct connection only — may fail on some
                    mobile networks
                  </>
                )}
              </p>
            )}
          </div>

          <div className="relative px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
            {phase === "incoming" ? (
              <div className="mx-auto flex max-w-sm items-center justify-between gap-8">
                <CallAction label="Decline" tone="destructive" onClick={() => void decline()}>
                  <PhoneOff className="h-7 w-7" />
                </CallAction>
                <CallAction label="Answer" tone="success" onClick={() => void answer()}>
                  <Phone className="h-7 w-7" />
                </CallAction>
              </div>
            ) : phase === "ended" ? null : (
              <div className="mx-auto flex max-w-sm flex-col items-center gap-7">
                <div className="flex items-center gap-10">
                  <CallAction
                    label={muted ? "Unmute" : "Mute"}
                    tone="muted"
                    active={muted}
                    onClick={toggleMute}
                  >
                    {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                  </CallAction>
                  <CallAction
                    label={speaker ? "Speaker" : "Earpiece"}
                    tone="muted"
                    active={speaker}
                    onClick={toggleSpeaker}
                  >
                    {speaker ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
                  </CallAction>
                </div>
                <CallAction label="End" tone="destructive" onClick={() => void hangUp()}>
                  <PhoneOff className="h-7 w-7" />
                </CallAction>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CallAction({
  children,
  label,
  tone,
  active,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  tone: "success" | "destructive" | "muted";
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          "grid h-[68px] w-[68px] place-items-center rounded-full transition-transform active:scale-95",
          tone === "success" && "bg-success text-background shadow-lg shadow-success/30",
          tone === "destructive" && "bg-destructive text-background shadow-lg shadow-destructive/30",
          tone === "muted" &&
            (active
              ? "bg-foreground text-background"
              : "border border-border/70 bg-muted/50 text-foreground"),
        )}
      >
        {children}
      </button>
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
    </div>
  );
}
