import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  MapPin,
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
import { NearbyHelpList, type HelpPlace } from "@/components/allma/nearby-help-list";
import { EmergencyRoom } from "@/components/allma/calls/emergency-room";
import { getNearbyPlaces } from "@/lib/places.functions";
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
  const [helpPlaces, setHelpPlaces] = useState<HelpPlace[]>([]);
  const [helpLoading, setHelpLoading] = useState(false);
  const [selectedHelpId, setSelectedHelpId] = useState<string | null>(null);

  // Where the caller is, when they chose to share it with this receiver.
  const callerPoint =
    emergency?.location_shared && emergency.latitude !== null && emergency.longitude !== null
      ? { lat: emergency.latitude, lng: emergency.longitude }
      : null;
  // Coarse key so small GPS drift does not re-run the Places lookup.
  const callerAreaKey = callerPoint
    ? `${callerPoint.lat.toFixed(3)},${callerPoint.lng.toFixed(3)}`
    : null;

  useEffect(() => {
    if (!callerAreaKey) {
      setHelpPlaces([]);
      setHelpLoading(false);
      setSelectedHelpId(null);
      return;
    }
    const [lat, lng] = callerAreaKey.split(",").map(Number);
    let active = true;
    setHelpLoading(true);
    void getNearbyPlaces({
      data: {
        latitude: lat,
        longitude: lng,
        radiusMeters: 8000,
        limit: 8,
        types: ["hospital", "police", "fire_station", "doctor", "pharmacy"],
      },
    })
      .then((results) => {
        if (!active) return;
        setHelpPlaces(
          (results ?? []).map((place) => ({
            id: place.id,
            name: place.name,
            type: place.type,
            address: place.address,
            phone: place.phone,
            distance_m: place.distance_m,
            latitude: place.latitude,
            longitude: place.longitude,
          })),
        );
      })
      .catch(() => {
        if (active) setHelpPlaces([]);
      })
      .finally(() => {
        if (active) setHelpLoading(false);
      });
    return () => {
      active = false;
    };
  }, [callerAreaKey]);



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

  const firstName = (peer?.name ?? "An Allma member").split(" ")[0];
  const emergencyLabel = emergency ? emergency.emergency_type.replace(/_/g, " ") : null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-background text-foreground"
          role="dialog"
          aria-label="Allma voice call"
        >
          {/* ── Emergency status bar ─────────────────────────────────────── */}
          <header className="relative z-10 shrink-0 border-b border-foreground/15 bg-foreground px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-background sm:px-7">
            <div className="mx-auto grid w-full max-w-4xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-background/70">
                  <span className="relative flex h-2 w-2 shrink-0">
                    {(phase === "incoming" || phase === "outgoing") && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60" />
                    )}
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
                  </span>
                  {isEmergencyCall
                    ? phase === "incoming"
                      ? "Incoming emergency"
                      : "Allma emergency call"
                    : "Allma voice call"}
                </p>
                <p className="mt-1 truncate font-display text-[15px] font-black tracking-tight sm:text-base">
                  Allma Safety Network
                </p>
              </div>
              {emergencyLabel && (
                <div className="min-w-0 text-right">
                  <p className="truncate text-[12px] font-bold capitalize">{emergencyLabel}</p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-background/60">
                    {emergency?.severity}
                  </p>
                </div>
              )}
            </div>
          </header>

          <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-44 pt-5 sm:px-6 lg:pb-8">
            <div className="mx-auto w-full max-w-4xl min-w-0 space-y-5">
              {/* ── 1. Caller identity ─────────────────────────────────── */}
              <section
                className="cmd-panel cmd-rise flex min-w-0 flex-col items-center px-5 py-7 text-center sm:px-8 sm:py-9"
                aria-label="Caller"
              >
                <p className="cmd-label text-destructive">
                  {phase === "incoming"
                    ? isEmergencyCall
                      ? "Incoming emergency"
                      : "Incoming call"
                    : phase === "outgoing"
                      ? "Calling"
                      : phase === "ended"
                        ? "Call ended"
                        : "On call"}
                </p>

                <motion.div
                  className="relative mt-5 rounded-full bg-card p-1.5 ring-2 ring-destructive/35 ring-offset-4 ring-offset-card"
                  animate={
                    phase === "incoming" || phase === "outgoing" ? { scale: [1, 1.035, 1] } : {}
                  }
                  transition={{ repeat: Infinity, duration: 1.8 }}
                >
                  <Avatar name={peer?.name ?? "Allma member"} url={peer?.avatarUrl ?? null} size={104} />
                </motion.div>

                <h2 className="mt-6 max-w-full break-words font-display text-[26px] font-black leading-tight tracking-tight sm:text-4xl">
                  {peer?.name ?? "Allma member"}
                </h2>
                <p className="mt-2 text-sm font-semibold text-muted-foreground sm:text-base">
                  {phase === "incoming"
                    ? isEmergencyCall
                      ? "needs your help"
                      : "is calling you"
                    : statusLine}
                </p>

                {emergencyLabel && (
                  <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-destructive/25 bg-destructive/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-destructive">
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                    {emergencyLabel}
                  </p>
                )}

                {emergency?.location_shared && emergency.area && (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
                    {emergency.area}
                  </p>
                )}

                {phase === "active" && quality !== "connecting" && (
                  <p className="mt-4 font-mono text-3xl font-semibold tabular-nums">
                    {formatDuration(seconds)}
                  </p>
                )}

                <p className="mt-5 inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden />
                  In-app emergency call · phone numbers remain private
                </p>
              </section>

              {emergency && phase !== "ended" && (
                <>
                  {/* ── 2. Emergency details ───────────────────────────── */}
                  <section
                    className="cmd-panel-critical cmd-rise min-w-0 p-4 sm:p-5"
                    style={{ animationDelay: "60ms" }}
                    aria-label="Emergency details"
                  >
                    <p className="cmd-label text-destructive">Emergency details</p>
                    <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="min-w-0">
                        <dt className="cmd-label">Emergency</dt>
                        <dd className="mt-1 break-words text-[13.5px] font-bold capitalize text-foreground">
                          {emergencyLabel}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="cmd-label">Location</dt>
                        <dd className="mt-1 break-words text-[13.5px] font-bold text-foreground">
                          {emergency.location_shared ? emergency.area : "Not shared with you"}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="cmd-label">Location status</dt>
                        <dd className="mt-1 text-[13.5px] font-bold text-foreground">
                          {emergency.location_shared ? "Live location available" : "Not available"}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="cmd-label">Severity</dt>
                        <dd className="mt-1 text-[13.5px] font-bold uppercase text-destructive">
                          {emergency.severity}
                        </dd>
                      </div>
                      {emergency.location_shared && typeof emergency.accuracy_m === "number" && (
                        <div className="min-w-0">
                          <dt className="cmd-label">GPS accuracy</dt>
                          <dd className="mt-1 text-[13.5px] font-bold text-foreground">
                            Approximately {Math.round(emergency.accuracy_m)} m
                          </dd>
                        </div>
                      )}
                    </dl>
                  </section>

                  {/* ── 3. Live location map ───────────────────────────── */}
                  {callerPoint && (
                    <section
                      aria-label="Caller location"
                      className="cmd-panel cmd-rise min-w-0 overflow-hidden p-3 sm:p-4"
                      style={{ animationDelay: "120ms" }}
                    >
                      <p className="cmd-label mb-3">Live location</p>
                      <LiveLocationMap
                        location={{
                          lat: callerPoint.lat,
                          lng: callerPoint.lng,
                          accuracy: emergency.accuracy_m ?? null,
                          address: emergency.area,
                        }}
                        badge="Live · shared"
                        directions
                        directionsLabel="Directions to caller"
                        places={helpPlaces}
                        selectedPlaceId={selectedHelpId}
                        onSelectPlace={setSelectedHelpId}
                        heightClassName="h-52 sm:h-64 lg:h-80"
                      />
                    </section>
                  )}

                  {/* ── 4. Nearby help ─────────────────────────────────── */}
                  {callerPoint && (
                    <section
                      className="cmd-panel cmd-rise min-w-0 p-4 sm:p-5"
                      style={{ animationDelay: "180ms" }}
                      aria-label="Help near the caller"
                    >
                      <NearbyHelpList
                        places={helpPlaces}
                        loading={helpLoading}
                        origin={callerPoint}
                        selectedId={selectedHelpId}
                        onSelect={setSelectedHelpId}
                        tone="surface"
                        title="Help near the caller"
                        subtitle="Police, clinics and hospitals closest to their location"
                        emptyLabel="No police, clinics or hospitals were found near the caller yet."
                      />
                    </section>
                  )}

                  {sosRoomId && (
                    <section
                      className="cmd-panel cmd-rise min-w-0 px-3 py-1"
                      style={{ animationDelay: "240ms" }}
                      aria-label="Shared emergency chat"
                    >
                      <EmergencyRoom sosActivityId={sosRoomId} currentUserId={userId} compact showLocation={false} />
                    </section>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Answer / Decline ─────────────────────────────────────────── */}
          <div className="fixed inset-x-0 bottom-0 z-20 shrink-0 border-t border-foreground/12 bg-card/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_50px_color-mix(in_oklab,var(--foreground)_14%,transparent)] backdrop-blur-xl sm:px-6 lg:relative lg:inset-auto lg:py-4 lg:shadow-none">
            {phase === "incoming" ? (
              <div className="mx-auto flex w-full max-w-3xl items-stretch gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={() => void decline()}
                  className="flex min-h-[62px] shrink-0 items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-muted px-5 text-[13px] font-bold text-destructive transition duration-200 hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 active:scale-[0.98] sm:px-7"
                >
                  <PhoneOff className="h-5 w-5" aria-hidden />
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() => void answer()}
                  className="answer-breathe flex min-h-[62px] min-w-0 flex-1 items-center justify-center gap-3 rounded-2xl bg-success px-5 text-success-foreground transition duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 active:scale-[0.99]"
                >
                  <Phone className="h-6 w-6 shrink-0" aria-hidden />
                  <span className="min-w-0 text-left">
                    <span className="block text-[14px] font-black uppercase tracking-[0.08em]">
                      Answer emergency call
                    </span>
                    <span className="block truncate text-[11.5px] font-semibold opacity-85">
                      Connect with {peer?.name ?? firstName}
                    </span>
                  </span>
                </button>
              </div>
            ) : phase === "ended" ? null : (
              <div className="mx-auto flex max-w-sm flex-col items-center gap-5">
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
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          "grid h-16 w-16 place-items-center rounded-full ring-offset-2 ring-offset-background transition duration-200 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 active:scale-95 sm:h-[68px] sm:w-[68px]",
          tone === "success" && "bg-success text-success-foreground shadow-lg shadow-success/30 focus-visible:ring-success",
          tone === "destructive" && "border border-destructive/40 bg-muted text-destructive shadow-md focus-visible:ring-destructive",
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
