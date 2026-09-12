import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BellRing,
  Clipboard,
  Crosshair,
  MapPinned,
  MapPin,
  MessageCircle,
  Mic,
  MicOff,
  Navigation,
  Phone,
  PhoneOff,
  Settings,
  ShieldCheck,
  TriangleAlert,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/allma/brand";
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

  const copyCallerGps = async () => {
    if (!callerPoint) return;
    try {
      await navigator.clipboard.writeText(`${callerPoint.lat.toFixed(5)}, ${callerPoint.lng.toFixed(5)}`);
      toast.success("GPS coordinates copied");
    } catch {
      toast.error("Could not copy GPS coordinates");
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="receiver-deck fixed inset-0 z-[80] overflow-hidden bg-background text-foreground"
          role="dialog"
          aria-label="Allma voice call"
        >
          <aside className="receiver-sidebar hidden lg:flex">
            <div className="flex items-center gap-3 px-5 py-6">
              <BrandMark className="h-11 w-11 bg-transparent shadow-none" />
              <div><p className="text-lg font-black">Allma</p><p className="text-[11px] text-background/65">Safety AI</p></div>
            </div>
            <nav className="space-y-1 px-4" aria-label="Emergency screen sections">
              <a href="#receiver-caller" className="receiver-nav receiver-nav-active"><BellRing /> Emergency</a>
              <a href="#receiver-map" className="receiver-nav"><MapPinned /> Map & Location</a>
              <a href="#receiver-help" className="receiver-nav"><Users /> Contacts</a>
              {sosRoomId && <a href="#receiver-chat" className="receiver-nav"><MessageCircle /> Chat</a>}
              <span className="receiver-nav"><Phone /> Voice</span>
              <span className="receiver-nav"><Settings /> Settings</span>
            </nav>
            <div className="mt-auto px-5 pb-7"><p className="text-sm font-black">Your safety<br />matters.</p><p className="mt-3 text-xs font-bold text-success">Allma Safety AI</p><p className="mt-1 text-[10px] text-background/55">Smarter tools. Safer communities.</p></div>
          </aside>

          <div className="receiver-shell lg:pl-[228px]">
            <header className="receiver-topbar">
              <div className="flex min-w-0 items-center gap-3 lg:hidden">
                <BrandMark className="h-9 w-9 bg-transparent shadow-none" />
                <div className="min-w-0"><p className="truncate text-base font-black">Allma</p><p className="text-[10px] text-background/65">Safety AI</p></div>
              </div>
              <div className="hidden min-w-0 items-center gap-3 lg:flex">
                <span className="relative flex h-2.5 w-2.5 shrink-0"><span className="absolute inset-0 animate-ping rounded-full bg-destructive" /><span className="relative h-2.5 w-2.5 rounded-full bg-destructive" /></span>
                <div><p className="text-[11px] font-black uppercase text-destructive">{phase === "incoming" ? "Incoming emergency" : statusLine}</p><p className="text-[10px] text-background/65">Allma Safety Network</p></div>
              </div>
              <div className="ml-auto flex items-center gap-4">
                <div className="hidden text-right text-[10px] lg:block"><p className="font-bold">Case {callId ? `ASA-${callId.slice(0, 8).toUpperCase()}` : "Loading"}</p><p className="capitalize text-background/65">{emergencyLabel ?? "Voice call"}</p></div>
                <Button variant="ghost" size="sm" onClick={() => void decline()} className="border border-background/20 bg-background/5 text-background hover:bg-background/10 hover:text-background"><X /> Close</Button>
              </div>
            </header>

            <main className="receiver-scroll">
              <div className="mx-auto w-full max-w-[1320px] px-3 py-3 sm:px-5 sm:py-4">
                <section className="receiver-mobile-alert lg:hidden">
                  <div className="flex min-w-0 items-center gap-3"><span className="h-7 w-7 shrink-0 rounded-full bg-destructive" /><div className="min-w-0"><p className="text-[12px] font-black uppercase">Incoming emergency</p><p className="truncate text-[10px] text-background/70">Allma Safety Network</p></div></div>
                  <div className="min-w-0 border-l border-background/35 pl-3 text-[9px]"><p className="truncate font-bold">Case {callId ? `ASA-${callId.slice(0, 8).toUpperCase()}` : "Loading"}</p><p className="truncate capitalize text-background/70">{emergencyLabel ?? "Voice call"}</p></div>
                </section>

                <div className="receiver-workspace">
                  <div className="min-w-0 space-y-3">
                    <section id="receiver-caller" className="receiver-caller-card">
                      <div className="receiver-caller-main">
                        <motion.div className="receiver-avatar" animate={phase === "incoming" || phase === "outgoing" ? { scale: [1, 1.025, 1] } : {}} transition={{ repeat: Infinity, duration: 1.8 }}>
                          <Avatar name={peer?.name ?? "Allma member"} url={peer?.avatarUrl ?? null} size={94} />
                          <span className="receiver-avatar-phone"><Phone /></span>
                        </motion.div>
                        <div className="min-w-0 flex-1">
                          <h2 className="break-words text-2xl font-black leading-none sm:text-[29px]">{peer?.name ?? "Allma member"}</h2>
                          <p className="mt-1 text-lg font-semibold leading-tight text-background/90">{phase === "incoming" && isEmergencyCall ? "needs your help" : statusLine}</p>
                          {emergencyLabel && <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-destructive/60 bg-destructive/15 px-3 py-1 text-[10px] font-bold capitalize"><TriangleAlert className="h-3.5 w-3.5" />{emergencyLabel}</p>}
                          {emergency?.location_shared && emergency.area && <p className="mt-3 flex items-start gap-2 text-[12px] font-semibold text-background/80"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{emergency.area}</p>}
                          <p className="mt-2 flex items-center gap-2 text-[10.5px] text-background/65"><ShieldCheck className="h-3.5 w-3.5 shrink-0" />In-app call · Phone numbers stay private</p>
                          {phase === "active" && quality !== "connecting" && <p className="mt-3 font-mono text-xl tabular-nums">{formatDuration(seconds)}</p>}
                        </div>
                      </div>

                      <div className="receiver-call-actions">
                        {phase === "incoming" ? <>
                          <Button variant="outline" onClick={() => void decline()} className="receiver-decline"><span className="grid h-9 w-9 place-items-center rounded-full bg-background"><PhoneOff /></span><span className="text-left"><strong className="block">Decline</strong><small className="hidden font-normal opacity-60 sm:block">Ignore this call</small></span></Button>
                          <Button onClick={() => void answer()} className="receiver-answer answer-breathe"><span className="grid h-9 w-9 place-items-center rounded-full bg-success-foreground text-success"><Phone /></span><span className="min-w-0 text-left"><strong className="block truncate">Answer Emergency Call</strong><small className="block truncate font-normal opacity-80">Connect with {peer?.name ?? firstName}</small></span></Button>
                        </> : phase === "ended" ? <p className="col-span-2 py-3 text-center text-sm font-bold">{endedNote ?? "Call ended"}</p> : <div className="col-span-2 flex items-center justify-center gap-8 py-1"><CallAction label={muted ? "Unmute" : "Mute"} tone="muted" active={muted} onClick={toggleMute}>{muted ? <MicOff /> : <Mic />}</CallAction><CallAction label={speaker ? "Speaker" : "Earpiece"} tone="muted" active={speaker} onClick={toggleSpeaker}>{speaker ? <Volume2 /> : <VolumeX />}</CallAction><CallAction label="End" tone="destructive" onClick={() => void hangUp()}><PhoneOff /></CallAction></div>}
                      </div>
                    </section>

                    {emergency && phase !== "ended" && <>
                      <section className="receiver-facts" aria-label="Emergency details">
                        <Fact icon={<BellRing />} label="Emergency type" value={emergencyLabel ?? "Emergency"} tone="danger" />
                        <Fact icon={<MapPin />} label="Location" value={emergency.location_shared ? emergency.area : "Not shared"} />
                        <Fact icon={<Crosshair />} label="GPS accuracy" value={typeof emergency.accuracy_m === "number" ? `Approximately ${Math.round(emergency.accuracy_m)} m` : "Waiting for GPS"} />
                        <Fact icon={<Clipboard />} label="Case ID" value={callId ? `ASA-${callId.slice(0, 8).toUpperCase()}` : "Loading"} />
                      </section>

                      {callerPoint && <section id="receiver-map" className="receiver-surface" aria-label="Caller location"><div className="receiver-section-head"><span className="h-2 w-2 rounded-full bg-success" /><div className="min-w-0"><p>Live location</p><span>Shared with responders</span></div></div><LiveLocationMap location={{ lat: callerPoint.lat, lng: callerPoint.lng, accuracy: emergency.accuracy_m ?? null, address: emergency.area }} badge="Live location" directions directionsLabel="Open in Google Maps" places={helpPlaces} selectedPlaceId={selectedHelpId} onSelectPlace={setSelectedHelpId} heightClassName="h-52 sm:h-64 lg:h-[260px]" /></section>}

                      {callerPoint && <section id="receiver-help" className="receiver-surface"><NearbyHelpList places={helpPlaces} loading={helpLoading} origin={callerPoint} selectedId={selectedHelpId} onSelect={setSelectedHelpId} tone="surface" title="Help near the caller" subtitle="Police, clinics and hospitals closest to where they are" emptyLabel="No police, clinics or hospitals were found near the caller yet." /></section>}
                      {sosRoomId && <section id="receiver-chat" className="receiver-surface"><EmergencyRoom sosActivityId={sosRoomId} currentUserId={userId} compact showLocation={false} /></section>}
                    </>}
                  </div>

                  {emergency && phase !== "ended" && <aside className="receiver-info-rail">
                    <InfoCard icon={<BellRing />} title="Emergency details"><InfoRow label="Case ID" value={callId ? `ASA-${callId.slice(0, 8).toUpperCase()}` : "Loading"} /><InfoRow label="Type" value={emergencyLabel ?? "Emergency"} /><InfoRow label="Location" value={emergency.location_shared ? emergency.area : "Not shared"} /><InfoRow label="GPS Accuracy" value={typeof emergency.accuracy_m === "number" ? `Approximately ${Math.round(emergency.accuracy_m)} m` : "Waiting"} /></InfoCard>
                    <InfoCard icon={<MapPin />} title="Location"><p className="text-[11px] font-bold text-success">Live location shared</p><p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Your location is visible to the response team.</p>{callerPoint && <a href="#receiver-map" className="receiver-rail-action"><MapPinned /> View on Map</a>}</InfoCard>
                    <InfoCard icon={<Crosshair />} title="Quick actions">{callerPoint && <><a className="receiver-quick" href={`https://www.google.com/maps/dir/?api=1&destination=${callerPoint.lat},${callerPoint.lng}`} target="_blank" rel="noreferrer"><Navigation /> Directions to location</a><Button variant="ghost" className="receiver-quick" onClick={() => void copyCallerGps()}><Clipboard /> Copy GPS coordinates</Button></>}</InfoCard>
                  </aside>}
                </div>
              </div>
            </main>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Fact({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "danger" }) {
  return <div className="receiver-fact"><span className={cn("receiver-fact-icon", tone === "danger" && "text-destructive")}>{icon}</span><div className="min-w-0"><p>{label}</p><strong>{value}</strong></div></div>;
}

function InfoCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <section className="receiver-info-card"><header>{icon}<h3>{title}</h3></header><div className="mt-4">{children}</div></section>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="receiver-info-row"><span>{label}</span><strong>{value}</strong></div>;
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
