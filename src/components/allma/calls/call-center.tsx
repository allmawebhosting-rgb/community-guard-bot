import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "@tanstack/react-router";
import {
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
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
import { LiveLocationMap } from "@/components/allma/live-location-map";
import { acceptEmergencyCallInvitation, getEmergencyCallContext, type EmergencyCallContext } from "@/lib/sos-calling";
import { startSosEmergencyCall } from "@/lib/sos-calling";
import {
  VoiceCallEngine,
  formatDuration,
  microphoneErrorMessage,
  primeMicrophone,
  onVoiceCallRequest,
  registerVoiceDevice,
  setCallStatus,
  startVoiceCall,
  type CallPeer,
  type ConnectionQuality,
} from "@/lib/zego-call";

type Phase = "idle" | "outgoing" | "incoming" | "active" | "ended";

const RING_TIMEOUT_MS = 40_000;

const qualityCopy: Record<ConnectionQuality, string> = {
  connecting: "Connecting…",
  good: "Connected",
  poor: "Poor connection",
  reconnecting: "Reconnecting…",
};

export function CallCenter() {
  const navigate = useNavigate();
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
  const [emergency, setEmergency] = useState<EmergencyCallContext | null>(null);
  const [sosRoomId, setSosRoomId] = useState<string | null>(null);

  const engineRef = useRef<VoiceCallEngine | null>(null);
  const callIdRef = useRef<string | null>(null);
  const sosOutgoingRef = useRef(new Map<string, CallPeer>());
  const sosPrimaryClaimedRef = useRef(false);
  const sosWinnerClaimedRef = useRef(false);
  const phaseRef = useRef<Phase>("idle");
  const namesRef = useRef<Map<string, CallPeer>>(new Map());
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerRef = useRef<CallPeer | null>(null);
  const isCallerRef = useRef(false);
  peerRef.current = peer;
  isCallerRef.current = isCaller;
  phaseRef.current = phase;

  const teardown = useCallback((note: string | null) => {
    engineRef.current?.close();
    engineRef.current = null;
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    ringTimerRef.current = null;
    callIdRef.current = null;
    sosOutgoingRef.current.clear();
    sosPrimaryClaimedRef.current = false;
    sosWinnerClaimedRef.current = false;
    setCallId(null);
    setSeconds(0);
    setMuted(false);
    setQuality("connecting");
    setEndedNote(note);
    setEmergency(null);
    setSosRoomId(null);
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
        void registerVoiceDevice().catch((error) => {
          console.warn("Allma Voice device registration unavailable", error);
        });
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
    async (id: string, caller: boolean, stream?: MediaStream) => {
      const engine = new VoiceCallEngine(id, userId!, caller, {
        onQuality: setQuality,
        onConnected: () => {
          setQuality("good");
          setPhase("active");
          void setCallStatus(id, "connected").catch(() => undefined);
        },
        onEnded: () => {
          void setCallStatus(id, "ended").catch(() => undefined);
          teardown("Call ended");
        },
        onFailed: (message) => {
          void setCallStatus(id, "failed", message).catch(() => undefined);
          teardown(message);
        },
      }, stream);
      engineRef.current = engine;
      await engine.start();
    },
    [teardown, userId],
  );

  // Outgoing call requests from anywhere in the app.
  useEffect(() => {
    // Do not consume an SOS auto-call until authentication has restored. The
    // request queue in zego-call will replay it once this listener is ready.
    if (!userId) return;
    return onVoiceCallRequest((requested) => {
      void (async () => {
        if (callIdRef.current && !requested.sosActivityId) {
          toast.error("You are already on a call.");
          return;
        }
        const isPrimarySosCall = Boolean(
          requested.sosActivityId && !callIdRef.current && !sosPrimaryClaimedRef.current,
        );
        if (isPrimarySosCall) {
          sosPrimaryClaimedRef.current = true;
          setPeer(requested);
          setIsCaller(true);
          setPhase("outgoing");
          setEndedNote(null);
          setQuality("connecting");
        }
        let id: string | null = null;
        try {
          // SOS calls go through the SOS-scoped RPC so the server can verify the
          // caller owns that emergency and link the call to it.
          id = requested.sosActivityId
            ? await startSosEmergencyCall(requested.id, requested.sosActivityId)
            : await startVoiceCall(requested.id);
          if (isPrimarySosCall || !requested.sosActivityId) callIdRef.current = id;
          sosOutgoingRef.current.set(id, requested);
          if (isPrimarySosCall) setCallId(id);
          // Best-effort: rings the recipient's device even if their app is closed.
          void notifyIncomingCall({ data: { callId: id } }).then((result) => {
            if (result.devices === 0) {
              console.warn("[ALLMA PUSH] no registered recipient devices", {
                callId: id,
                recipientId: requested.id,
              });
              if (isPrimarySosCall) {
                toast.message(`${requested.name} has not enabled background notifications on their device.`);
              }
            } else if (isPrimarySosCall && result.delivered === 0) {
              toast.message(`Background alert could not reach ${requested.name}'s device.`);
            }
          }).catch((error) => {
            console.error("[ALLMA PUSH] incoming call notification failed", {
              callId: id,
              message: error instanceof Error ? error.message : "unknown",
            });
          });
          // Join from the user's Call tap so iOS Safari permits microphone access.
          // CONNECTED is still deferred until ZEGOCLOUD reports a remote stream.
          if (isPrimarySosCall || !requested.sosActivityId) {
            const activeId = id;
            const microphoneStream = requested.microphoneStream ?? await primeMicrophone();
            await beginEngine(activeId, true, microphoneStream);
            await setCallStatus(activeId, "connecting");
            ringTimerRef.current = setTimeout(() => {
              void setCallStatus(activeId, "missed").catch(() => undefined);
              teardown(`${requested.name} did not answer.`);
            }, RING_TIMEOUT_MS);
          }

        } catch (error) {
          const message =
            error instanceof DOMException
              ? microphoneErrorMessage(error)
              : error instanceof Error
                ? error.message
                : "The call could not be placed.";
          if (id && callIdRef.current === id) {
            await setCallStatus(id, "failed", message).catch(() => undefined);
          }
          requested.onError?.(message);
          if (isPrimarySosCall || !requested.sosActivityId) teardown(message);
          if (isPrimarySosCall || !requested.sosActivityId) toast.error(message);
        }
      })();
    });
  }, [beginEngine, teardown, userId]);

  // Incoming calls + live call state for both sides.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      // Unique topic per mount: reusing a topic returns an already-subscribed
      // channel, and adding listeners to that throws.
      .channel(`allma-calls-${userId}-${Math.random().toString(36).slice(2)}`)

      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "emergency_calls", filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as {
            id: string;
            caller_id: string;
            status: string;
            sos_session_id?: string | null;
          };
          if (callIdRef.current || row.status === "ended") return;
          const known = namesRef.current.get(row.caller_id);
          callIdRef.current = row.id;
          setCallId(row.id);
          setPeer(known ?? { id: row.caller_id, name: "Allma member" });
          setIsCaller(false);
          setEndedNote(null);
          setEmergency(null);
          setSosRoomId(row.sos_session_id ?? null);
          setPhase("incoming");

          void setCallStatus(row.id, "ringing").catch(() => undefined);
          // Only the authorised recipient can read this, and only permitted fields.
          void getEmergencyCallContext(row.id).then((context) => {
            if (callIdRef.current !== row.id || !context) return;
            if (context.is_emergency) {
              setEmergency(context);
              setPeer((current) => ({
                ...(current ?? { id: row.caller_id }),
                name: context.caller_name,
                avatarUrl: context.caller_avatar_url,
              }));
            }
          });
          ringTimerRef.current = setTimeout(() => teardown("Missed call"), RING_TIMEOUT_MS);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "emergency_calls" },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          const pendingSosPeer = sosOutgoingRef.current.get(row.id);
          if (row.id !== callIdRef.current && pendingSosPeer && (row.status === "connecting" || row.status === "connected") && phaseRef.current === "outgoing" && !sosWinnerClaimedRef.current) {
            sosWinnerClaimedRef.current = true;
            engineRef.current?.close();
            engineRef.current = null;
            callIdRef.current = row.id;
            setCallId(row.id);
            setPeer(pendingSosPeer);
            void beginEngine(row.id, true, pendingSosPeer.microphoneStream)
              .then(() => setCallStatus(row.id, "connecting"))
              .catch(() => undefined);
          }
          if (row.id !== callIdRef.current) return;
          if (row.status === "declined") teardown(`${peerRef.current?.name ?? "They"} declined the call.`);
          else if (row.status === "ended") teardown("Call ended");
          else if (row.status === "missed") teardown("No answer");
          else if (row.status === "connecting" || row.status === "connected") {
            // The other side answered: stop the ring timeout so the call is never
            // cut off while the audio streams are still being negotiated.
            if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
            ringTimerRef.current = null;
            setPhase("active");
            if (isCallerRef.current && !engineRef.current) {
              void beginEngine(row.id, true).catch(async (error) => {
                const message =
                  error instanceof DOMException
                    ? microphoneErrorMessage(error)
                    : error instanceof Error
                      ? error.message
                      : "The voice connection could not start.";
                await setCallStatus(row.id, "failed", message).catch(() => undefined);
                teardown(message);
                toast.error(message);
              });
            }
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // Deliberately keyed only on identity: re-subscribing per render would leak channels.
  }, [beginEngine, teardown, userId]);

  // Cold-start recovery: a notification can open /calls after the realtime
  // INSERT has already happened. Read only the authenticated recipient's live
  // call row; sensitive emergency context is fetched through its RPC below.
  useEffect(() => {
    if (!userId || callIdRef.current || typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("call");
    if (!id) return;
    void (async () => {
      const { data: row } = await supabase
        .from("emergency_calls")
        .select("id, caller_id, status, sos_session_id")
        .eq("id", id)
        .eq("recipient_id", userId)
        .in("status", ["initiating", "ringing", "connecting"])
        .maybeSingle();
      if (!row || callIdRef.current) return;
      const known = namesRef.current.get(row.caller_id);
      callIdRef.current = row.id;
      setCallId(row.id);
      setPeer(known ?? { id: row.caller_id, name: "Allma member" });
      setIsCaller(false);
      setEndedNote(null);
      setEmergency(null);
      setSosRoomId(row.sos_session_id ?? null);
      setPhase("incoming");
      void setCallStatus(row.id, "ringing").catch(() => undefined);
      void getEmergencyCallContext(row.id).then((context) => {
        if (callIdRef.current !== row.id || !context) return;
        if (context.is_emergency) {
          setEmergency(context);
          setPeer((current) => ({
            ...(current ?? { id: row.caller_id }),
            name: context.caller_name,
            avatarUrl: context.caller_avatar_url,
          }));
        }
      });
      const contextTimer = window.setInterval(() => {
        if (callIdRef.current === row.id && (phaseRef.current === "incoming" || phaseRef.current === "active")) {
          void getEmergencyCallContext(row.id).then((context) => {
            if (callIdRef.current === row.id && context) setEmergency(context);
          });
        }
      }, 3000);
      ringTimerRef.current = setTimeout(() => teardown("Missed call"), RING_TIMEOUT_MS);
      window.setTimeout(() => window.clearInterval(contextTimer), RING_TIMEOUT_MS);
    })();
  }, [teardown, userId]);

  useEffect(() => {
    if (!callId || (phase !== "incoming" && phase !== "active")) return;
    const refreshContext = () => {
      void getEmergencyCallContext(callId).then((context) => {
        if (callIdRef.current === callId && context) setEmergency(context);
      });
    };
    const timer = window.setInterval(refreshContext, 3000);
    return () => window.clearInterval(timer);
  }, [callId, emergency?.is_emergency, phase]);

  // Call timer starts only when real audio is connected.
  useEffect(() => {
    if (phase !== "active" || quality === "connecting") return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [phase, quality]);

  // Spoken announcement for emergency calls, so a recipient who only hears the
  // device still learns who needs help. Uses the caller's real SOS record.
  useEffect(() => {
    if (phase !== "incoming" || !emergency?.is_emergency) return;
    const speech = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!speech) return;
    const first = (emergency.caller_name || peerRef.current?.name || "An Allma member").split(" ")[0];
    const type = emergency.emergency_type.replace(/_/g, " ");
    const utterance = new SpeechSynthesisUtterance(
      `${first} is in danger. ${type} emergency on Allma. Please answer.`,
    );
    utterance.rate = 1;
    const timer = setInterval(() => {
      if (!speech.speaking) speech.speak(utterance);
    }, 6000);
    speech.speak(utterance);
    return () => {
      clearInterval(timer);
      speech.cancel();
    };
  }, [emergency, phase]);

  useEffect(() => () => engineRef.current?.close(), []);

  const answer = async () => {
    const id = callIdRef.current;
    if (!id) return;
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    try {
      const invitationId = new URLSearchParams(window.location.search).get("invitation");
      if (invitationId) {
        const result = await acceptEmergencyCallInvitation(invitationId);
        if (!result.accepted) {
          toast.message("Another responder has already accepted this emergency.");
          teardown("Another responder has accepted this emergency.");
          return;
        }
      }
      const microphoneStream = await primeMicrophone();
      await setCallStatus(id, "connecting");
      await beginEngine(id, false, microphoneStream);
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
  const isEmergencyCall = Boolean(emergency) || Boolean(peer?.sosActivityId);
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
          className="fixed inset-0 z-[80] flex flex-col bg-background/95 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
          role="dialog"
          aria-label="Allma voice call"
        >
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b to-transparent",
              isEmergencyCall ? "from-destructive/20" : "from-primary/12",
            )}
          />

          <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p
              className={cn(
                "inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.3em]",
                isEmergencyCall ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {isEmergencyCall && <TriangleAlert className="h-3.5 w-3.5" />}
              {isEmergencyCall
                ? "Allma emergency call"
                : phase === "incoming"
                  ? "Allma call"
                  : "Allma voice call"}
            </p>

            <motion.div
              className="mt-8"
              animate={phase === "incoming" || phase === "outgoing" ? { scale: [1, 1.04, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1.8 }}
            >
              <Avatar name={peer?.name ?? "Allma member"} url={peer?.avatarUrl ?? null} size={112} />
            </motion.div>

            <h2 className="mt-6 text-2xl font-bold tracking-tight">
              {isEmergencyCall && phase === "incoming"
                ? `${(peer?.name ?? "An Allma member").split(" ")[0]} is in danger`
                : (peer?.name ?? "Allma member")}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {emergency && phase === "incoming"
                ? `has activated SOS · ${emergency.emergency_type.replace(/_/g, " ")}`
                : statusLine}
            </p>

            {emergency && phase !== "ended" && (
              <div className="mt-4 w-full max-w-sm space-y-3 text-left">
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-destructive">
                    Emergency
                  </p>
                  <p className="mt-1 text-[12px] font-semibold capitalize text-foreground">
                    {emergency.emergency_type.replace(/_/g, " ")} · {emergency.severity}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {emergency.location_shared ? emergency.area : "Location not shared with you"}
                  </p>
                  {emergency.location_shared && typeof emergency.accuracy_m === "number" && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      GPS accuracy: approximately {Math.round(emergency.accuracy_m)} m
                    </p>
                  )}
                </div>

                {emergency.location_shared &&
                  emergency.latitude !== null &&
                  emergency.longitude !== null && (
                    <LiveLocationMap
                      location={{
                        lat: emergency.latitude,
                        lng: emergency.longitude,
                        accuracy: emergency.accuracy_m ?? null,
                        address: emergency.area,
                      }}
                      badge="Live · shared"
                      directions
                      directionsLabel="Directions"
                    />
                  )}

                {sosRoomId && (
                  <button
                    type="button"
                    onClick={() => {
                      const room = sosRoomId;
                      teardown(null);
                      void navigate({ to: "/calls", search: { room } });
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gold/45 bg-gold/10 px-4 py-2.5 text-[12px] font-semibold text-foreground transition-colors hover:bg-gold/20"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Open emergency chat
                  </button>
                )}
              </div>
            )}


            {phase === "active" && quality !== "connecting" && (
              <p className="mt-3 font-mono text-3xl font-semibold tabular-nums">
                {formatDuration(seconds)}
              </p>
            )}

            <p className="mt-8 inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              In-app call · phone numbers stay private
            </p>

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
