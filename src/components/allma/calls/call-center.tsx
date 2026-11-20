import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import {
  Clipboard,
  Crosshair,
  MapPin,
  Mic,
  MicOff,
  Navigation,
  Phone,
  PhoneOff,
  ShieldCheck,
  TriangleAlert,
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
import { setCallAudioPhase } from "@/lib/call-audio-state";
import {
  setSosInlineCall,
  setSosInlineCallActions,
} from "@/lib/sos-inline-call";
import { Avatar } from "@/components/allma/safety-network/add-safety-contact";
import { LiveLocationMap } from "@/components/allma/live-location-map";
import { ResponderNavigation } from "@/components/allma/responder-navigation";
import type { HelpPlace } from "@/components/allma/nearby-help-list";
import { getNearbyPlaces } from "@/lib/places.functions";
import {
  claimSosEmergencyCall,
  getEmergencyCallContext,
  type EmergencyCallContext,
} from "@/lib/sos-calling";
import { openSharedSosConversation } from "@/lib/sos-rooms";
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

const RING_TIMEOUT_MS = 55_000;

function isChatRoute() {
  return (
    typeof window !== "undefined" &&
    (window.location.pathname === "/" || /^\/chat(?:\/|$)/.test(window.location.pathname))
  );
}

const qualityCopy: Record<ConnectionQuality, string> = {
  connecting: "Connecting…",
  good: "Connected",
  poor: "Poor connection",
  reconnecting: "Reconnecting…",
};

export function CallCenter() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [phase, setPhaseState] = useState<Phase>("idle");
  const setPhase = useCallback((next: Phase) => {
    setCallAudioPhase(next);
    setPhaseState(next);
  }, []);
  const [peer, setPeer] = useState<CallPeer | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [isCaller, setIsCaller] = useState(false);
  const [quality, setQuality] = useState<ConnectionQuality>("connecting");
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [sosCallStatus, setSosCallStatus] = useState<"idle" | "connecting" | "connected">("idle");
  const [endedNote, setEndedNote] = useState<string | null>(null);
  const [emergency, setEmergency] = useState<EmergencyCallContext | null>(null);
  const [sosRoomId, setSosRoomId] = useState<string | null>(null);
  const [helpPlaces, setHelpPlaces] = useState<HelpPlace[]>([]);
  const [helpLoading, setHelpLoading] = useState(false);
  const [localPoint, setLocalPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [localLocationError, setLocalLocationError] = useState<string | null>(null);
  const [receiverPoint, setReceiverPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [receiverLocationError, setReceiverLocationError] = useState<string | null>(null);

  // Where the caller is, when they chose to share it with this receiver.
  const callerPoint =
    emergency?.location_shared && emergency.latitude !== null && emergency.longitude !== null
      ? { lat: emergency.latitude, lng: emergency.longitude }
      : null;
  const hasEmergency = Boolean(emergency);
  useEffect(() => {
    const inlineSosOnChat = Boolean(peer?.sosActivityId) && isChatRoute();
    if (
      !isCaller ||
      !peer?.sosActivityId ||
      !peer.shareLocation ||
      phase === "ended" ||
      (phase === "idle" && !inlineSosOnChat)
    ) {
      setLocalPoint(null);
      setLocalLocationError(null);
      return;
    }
    if (!navigator.geolocation) {
      setLocalLocationError("This device does not provide live location.");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocalPoint({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocalLocationError(null);
      },
      (error) => {
        console.warn("Caller navigation location unavailable", error);
        setLocalLocationError(
          error.code === 1
            ? "Allow location access in your browser to get nearby directions."
            : "Waiting for a current GPS position.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isCaller, peer?.sosActivityId, peer?.shareLocation, phase]);

  // Ask the receiver for their location only after they accept and only if the
  // caller has not shared theirs. This GPS is used only to search public help.
  useEffect(() => {
    if (isCaller || !hasEmergency || phase !== "active" || callerPoint) {
      setReceiverPoint(null);
      setReceiverLocationError(null);
      return;
    }
    if (!navigator.geolocation) {
      setReceiverLocationError("This device does not provide live location.");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setReceiverPoint({ lat: position.coords.latitude, lng: position.coords.longitude });
        setReceiverLocationError(null);
      },
      (error) => {
        setReceiverLocationError(
          error.code === 1
            ? "Allow location access to find nearby help while caller GPS is unavailable."
            : "Waiting for your current GPS position to find nearby help.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [callId, callerPoint?.lat, callerPoint?.lng, hasEmergency, isCaller, phase]);

  const helpSearchPoint = isCaller
    ? localPoint
    : emergency
      ? callerPoint ?? receiverPoint
      : null;
  // Three-decimal rounding only refreshes the search after roughly 100 m.
  const helpAreaKey = helpSearchPoint
    ? `${helpSearchPoint.lat.toFixed(3)},${helpSearchPoint.lng.toFixed(3)}`
    : null;

  useEffect(() => {
    if (!helpAreaKey) {
      setHelpPlaces([]);
      setHelpLoading(false);
      return;
    }
    const [lat, lng] = helpAreaKey.split(",").map(Number);
    let active = true;
    setHelpLoading(true);
    void getNearbyPlaces({
      data: {
        latitude: lat,
        longitude: lng,
        radiusMeters: 8000,
        limit: 20,
        types: ["hospital", "medical_clinic", "doctor", "police", "fire_station", "pharmacy"],
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
  }, [helpAreaKey]);
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
  const sosCallStatusRef = useRef(sosCallStatus);
  peerRef.current = peer;
  isCallerRef.current = isCaller;
  sosCallStatusRef.current = sosCallStatus;
  phaseRef.current = phase;

  const setSosCallState = useCallback((status: "idle" | "connecting" | "connected") => {
    sosCallStatusRef.current = status;
    setSosCallStatus(status);
  }, []);

  const teardown = useCallback((note: string | null, options?: { clearSosOutgoing?: boolean }) => {
    const sosActivityId = peerRef.current?.sosActivityId;
    const clearSosOutgoing = options?.clearSosOutgoing !== false;
    engineRef.current?.close();
    engineRef.current = null;
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    ringTimerRef.current = null;
    callIdRef.current = null;
    // Parallel SOS dials keep several outgoing rows alive. Clearing the whole
    // map on one sibling `ended` used to drop the accepted winner before ZEGO joined.
    if (clearSosOutgoing) {
      sosOutgoingRef.current.clear();
      sosPrimaryClaimedRef.current = false;
      sosWinnerClaimedRef.current = false;
    }
    setSosCallState("idle");
    if (sosActivityId) setSosInlineCall(null);
    setCallId(null);
    setSeconds(0);
    setMuted(false);
    setQuality("connecting");
    setEndedNote(note);
    setEmergency(null);
    setSosRoomId(null);
    setPeer(null);
    setIsCaller(false);
    setPhase(sosActivityId ? "idle" : note ? "ended" : "idle");
    if (note && !sosActivityId) setTimeout(() => { if (phaseRef.current === "ended") setPhase("idle"); }, 2600);
  }, [setSosCallState, setPhase]);

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
          safetyRole: connection.safety_role || "Safety contact",
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
      if (!userId) return;
      const engine = new VoiceCallEngine(id, userId, caller, {
        onQuality: setQuality,
        onConnected: () => {
          setQuality("good");
          if (peerRef.current?.sosActivityId && isChatRoute()) {
            setSosCallState("connected");
            setPhaseState("idle");
            setCallAudioPhase("active");
          } else {
            setPhase("active");
          }
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
      }, stream, {
        quietErrors: Boolean(peerRef.current?.sosActivityId || sosOutgoingRef.current.has(id)),
      });
      engineRef.current = engine;
      await engine.start();
    },
    [setSosCallState, setPhase, teardown, userId],
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
        const isSosCall = Boolean(requested.sosActivityId);
        const isPrimarySosCall = Boolean(
          isSosCall && !callIdRef.current && !sosPrimaryClaimedRef.current,
        );
        if (isPrimarySosCall) {
          sosPrimaryClaimedRef.current = true;
          setPeer(requested);
          setIsCaller(true);
          if (isSosCall) {
            setPhaseState("idle");
            setCallAudioPhase("idle");
          } else {
            setPhase("outgoing");
          }
          setEndedNote(null);
          setQuality("connecting");
        }
        let id: string | null = null;
        try {
          if (!isSosCall) setPhase("outgoing");
          // SOS calls go through the SOS-scoped RPC so the server can verify the
          // caller owns that emergency and link the call to it.
          id = requested.sosActivityId
            ? await startSosEmergencyCall(requested.id, requested.sosActivityId)
            : await startVoiceCall(requested.id);
          if (!id) throw new Error("The call could not be started.");
          if (isPrimarySosCall || !requested.sosActivityId) callIdRef.current = id;
          sosOutgoingRef.current.set(id, requested);
          if (isPrimarySosCall) setCallId(id);
          // Await + retry so SOS invitations are written before the round window races ahead.
          const pushOnce = () => notifyIncomingCall({ data: { callId: id! } });
          let pushResult: Awaited<ReturnType<typeof notifyIncomingCall>> | null = null;
          try {
            pushResult = await pushOnce();
          } catch (firstPushError) {
            console.warn("[ALLMA PUSH] first notify failed; retrying", {
              callId: id,
              message: firstPushError instanceof Error ? firstPushError.message : "unknown",
            });
            try {
              await new Promise((resolve) => setTimeout(resolve, 700));
              pushResult = await pushOnce();
            } catch (retryPushError) {
              console.error("[ALLMA PUSH] incoming call notification failed", {
                callId: id,
                message: retryPushError instanceof Error ? retryPushError.message : "unknown",
              });
            }
          }
          if (pushResult) {
            if (pushResult.devices === 0) {
              console.warn("[ALLMA PUSH] no registered recipient devices", {
                callId: id,
                recipientId: requested.id,
              });
              if (isPrimarySosCall && !isSosCall) {
                toast.message(`${requested.name} has not enabled background notifications on their device.`);
              }
            } else if (isPrimarySosCall && !isSosCall && pushResult.delivered === 0) {
              toast.message(`Background alert could not reach ${requested.name}'s device.`);
            }
          }
          // Ordinary calls join from the user's Call tap. SOS calls join only
          // after a responder answers, so background alerts never take over chat.
          if (!isSosCall) {
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
          if (!isSosCall) {
            teardown(message);
            toast.error(message);
          } else if (isPrimarySosCall && !callIdRef.current) {
            sosPrimaryClaimedRef.current = false;
          }
        }
      })();
    });
  }, [beginEngine, setPhase, teardown, userId]);

  const presentIncomingCall = useCallback(
    (row: {
      id: string;
      caller_id: string | null;
      recipient_id: string;
      caller_display_name: string | null;
      status: string;
      sos_session_id: string | null;
    }) => {
      if (
        !userId ||
        row.caller_id === userId ||
        row.caller_id === row.recipient_id ||
        ["ended", "missed", "declined", "failed"].includes(row.status)
      ) {
        return false;
      }
      if (callIdRef.current === row.id) return true;
      if (callIdRef.current) {
        const busy =
          phaseRef.current === "incoming" ||
          phaseRef.current === "outgoing" ||
          phaseRef.current === "active" ||
          sosCallStatusRef.current !== "idle";
        if (busy) return false;
      }
      const known = row.caller_id ? namesRef.current.get(row.caller_id) : undefined;
      const callerPeer = {
        ...(known ?? {
          id: row.caller_id ?? `former-member-${row.id}`,
          name: row.caller_display_name ?? (row.caller_id ? "Allma member" : "Former Member"),
        }),
        ...(row.sos_session_id ? { sosActivityId: row.sos_session_id } : {}),
      };
      callIdRef.current = row.id;
      setCallId(row.id);
      setPeer(callerPeer);
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
            ...(current ?? callerPeer),
            name: context.caller_name,
            avatarUrl: context.caller_avatar_url,
          }));
        }
      });
      if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
      ringTimerRef.current = setTimeout(() => teardown("Missed call"), RING_TIMEOUT_MS);
      return true;
    },
    [setPhase, teardown, userId],
  );

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
            caller_id: string | null;
            recipient_id: string;
            caller_display_name?: string | null;
            status: string;
            sos_session_id?: string | null;
          };
          presentIncomingCall({
            id: row.id,
            caller_id: row.caller_id,
            recipient_id: row.recipient_id,
            caller_display_name: row.caller_display_name ?? null,
            status: row.status,
            sos_session_id: row.sos_session_id ?? null,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "emergency_calls" },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          const pendingSosPeer = sosOutgoingRef.current.get(row.id);
          const currentPeer = pendingSosPeer ?? peerRef.current;
          if (
            pendingSosPeer &&
            (row.status === "connecting" || row.status === "connected") &&
            !sosWinnerClaimedRef.current
          ) {
            sosWinnerClaimedRef.current = true;
            // Keep the accepted peer; drop siblings so later `ended` events
            // cannot wipe the winner before media connects.
            sosOutgoingRef.current.clear();
            sosOutgoingRef.current.set(row.id, pendingSosPeer);
            engineRef.current?.close();
            engineRef.current = null;
            callIdRef.current = row.id;
            setCallId(row.id);
            setPeer(pendingSosPeer);
            setIsCaller(true);
            setSosCallState("connecting");
            if (isChatRoute()) setCallAudioPhase("active");
            void beginEngine(row.id, true, pendingSosPeer.microphoneStream)
              .then(() => setCallStatus(row.id, "connecting"))
              .catch(() => undefined);
          } else if (
            pendingSosPeer &&
            (row.status === "declined" ||
              row.status === "missed" ||
              row.status === "failed" ||
              row.status === "ended")
          ) {
            // Sibling no-answer: remove only that outbound SOS dial.
            sosOutgoingRef.current.delete(row.id);
          }
          // Location writes on the caller's SOS row bump updated_at on active
          // call rows. Re-read the recipient-authorized context immediately so
          // the receiver's map hydrates as soon as GPS arrives.
          if (
            row.id === callIdRef.current &&
            !isCallerRef.current &&
            (phaseRef.current === "incoming" ||
              phaseRef.current === "active" ||
              sosCallStatusRef.current !== "idle")
          ) {
            void getEmergencyCallContext(row.id).then((context) => {
              if (
                callIdRef.current === row.id &&
                context?.is_emergency
              ) {
                setEmergency(context);
              }
            });
          }
          if (row.id !== callIdRef.current) return;
          if (row.status === "declined" || row.status === "missed" || row.status === "failed" || row.status === "ended") {
            const unansweredSos =
              Boolean(currentPeer?.sosActivityId) &&
              (row.status !== "ended" || sosCallStatusRef.current === "idle");
            if (unansweredSos) {
              sosOutgoingRef.current.delete(row.id);
              if (ringTimerRef.current) {
                clearTimeout(ringTimerRef.current);
                ringTimerRef.current = null;
              }
              // Another parallel SOS dial may still be ringing. Soft-clear the
              // UI for this row without wiping the remaining outbound peers.
              if (sosOutgoingRef.current.size > 0 && !sosWinnerClaimedRef.current) {
                setCallAudioPhase("idle");
                setPhaseState("idle");
                callIdRef.current = null;
                setCallId(null);
                setPeer(null);
                setIsCaller(false);
                setSosCallState("idle");
                setSosInlineCall(null);
                sosPrimaryClaimedRef.current = false;
                return;
              }
              teardown(row.status === "ended" ? "Call ended" : "Call cancelled", {
                clearSosOutgoing: sosOutgoingRef.current.size === 0,
              });
            } else {
              const note =
                row.status === "declined"
                  ? `${currentPeer?.name ?? "They"} declined the call.`
                  : row.status === "missed"
                    ? "No answer"
                    : row.status === "failed"
                      ? "Call failed"
                      : "Call ended";
              teardown(note);
            }
          }
          else if (row.status === "connecting" || row.status === "connected") {
            // The other side answered: stop the ring timeout so the call is never
            // cut off while the audio streams are still being negotiated.
            if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
            ringTimerRef.current = null;
            if (currentPeer?.sosActivityId) setSosCallState("connecting");
            if (currentPeer?.sosActivityId && isChatRoute()) {
              setPhaseState("idle");
              setCallAudioPhase("active");
            } else {
              setPhase("active");
            }
            if (isCallerRef.current && !engineRef.current) {
              void beginEngine(row.id, true, pendingSosPeer?.microphoneStream ?? currentPeer?.microphoneStream).catch(async (error) => {
                const message =
                  error instanceof DOMException
                    ? microphoneErrorMessage(error)
                    : error instanceof Error
                      ? error.message
                      : "The voice connection could not start.";
                await setCallStatus(row.id, "failed", message).catch(() => undefined);
                teardown(message);
                if (!currentPeer?.sosActivityId) toast.error(message);
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
  }, [beginEngine, presentIncomingCall, setPhase, setSosCallState, teardown, userId]);

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
        .select("id, caller_id, recipient_id, caller_display_name, status, sos_session_id")
        .eq("id", id)
        .eq("recipient_id", userId)
        .in("status", ["initiating", "ringing", "connecting"])
        .maybeSingle<{
          id: string;
          caller_id: string | null;
          recipient_id: string;
          caller_display_name: string | null;
          status: string;
          sos_session_id: string | null;
        }>();
      if (!row) return;
      presentIncomingCall(row);
    })();
  }, [presentIncomingCall, userId]);

  // Realtime can miss inserts when the tab is backgrounded. Poll for live
  // inbound SOS/voice rows so receivers still see the ring UI.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      const busy =
        Boolean(callIdRef.current) &&
        (phaseRef.current === "incoming" ||
          phaseRef.current === "outgoing" ||
          phaseRef.current === "active" ||
          sosCallStatusRef.current !== "idle");
      if (busy) return;
      const { data } = await supabase
        .from("emergency_calls")
        .select("id, caller_id, recipient_id, caller_display_name, status, sos_session_id, created_at")
        .eq("recipient_id", userId)
        .in("status", ["initiating", "ringing", "connecting"])
        .order("created_at", { ascending: false })
        .limit(3);
      const rows = (data as unknown as Array<{
        id: string;
        caller_id: string | null;
        recipient_id: string;
        caller_display_name: string | null;
        status: string;
        sos_session_id: string | null;
        created_at: string;
      }> | null) ?? [];
      if (cancelled || !rows.length) return;
      const preferred =
        rows.find((row) => Boolean(row.sos_session_id)) ?? rows[0];
      if (preferred) presentIncomingCall(preferred);
    };
    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 3500);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [presentIncomingCall, userId]);

  useEffect(() => {
    const inlineIncomingSos =
      Boolean(peer?.sosActivityId) &&
      !isCaller &&
      isChatRoute() &&
      sosCallStatus !== "idle";
    if (!callId || (phase !== "incoming" && phase !== "active" && !inlineIncomingSos)) return;
    const refreshContext = () => {
      void getEmergencyCallContext(callId).then((context) => {
        if (callIdRef.current === callId && context) setEmergency(context);
      });
    };
    const timer = window.setInterval(refreshContext, 3000);
    return () => window.clearInterval(timer);
  }, [callId, emergency?.is_emergency, isCaller, peer?.sosActivityId, phase, sosCallStatus]);

  // Call timer starts only when real audio is connected.
  useEffect(() => {
    const inlineSosActive =
      Boolean(peer?.sosActivityId) && isChatRoute() && sosCallStatus === "connected";
    if ((phase !== "active" && !inlineSosActive) || quality === "connecting") return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [peer?.sosActivityId, phase, quality, sosCallStatus]);

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

  useEffect(() => () => {
    engineRef.current?.close();
    setCallAudioPhase("idle");
  }, []);

  const answer = async () => {
    const id = callIdRef.current;
    if (!id) return;
    const isSosCall = Boolean(peerRef.current?.sosActivityId || sosRoomId);
    const sosActivityId = peerRef.current?.sosActivityId ?? sosRoomId;
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    try {
      let joinedThreadId: string | null = null;
      let isVoicePrimary = true;

      // Answering an SOS call is what authorises chat membership — always claim
      // when this is an emergency leg, never wait for a second "join chat" invite.
      if (isSosCall) {
        const result = await claimSosEmergencyCall(id);
        if (!result.accepted) {
          toast.message("This emergency call is no longer available to answer.");
          teardown("Emergency call unavailable.");
          return;
        }
        joinedThreadId = result.threadId;
        isVoicePrimary = result.isVoicePrimary;
        if (!joinedThreadId && sosActivityId) {
          try {
            joinedThreadId = await openSharedSosConversation(sosActivityId);
          } catch (navigationError) {
            console.warn("Shared SOS conversation fallback failed", navigationError);
          }
        }
        if (joinedThreadId) {
          const alreadyThere =
            typeof window !== "undefined" &&
            window.location.pathname === `/chat/${joinedThreadId}`;
          if (!alreadyThere) {
            await navigate({
              to: "/chat/$threadId",
              params: { threadId: joinedThreadId },
              replace: true,
            });
          }
        } else {
          toast.message("Call answered. Open the shared emergency chat from Call centre if it did not open.");
        }
      }

      if (isSosCall) {
        setSosCallState(isVoicePrimary ? "connecting" : "idle");
        setPhaseState("idle");
      }

      // Non-primary answerers join chat only — skip ZEGO media for their ended leg.
      if (isSosCall && !isVoicePrimary) {
        engineRef.current?.close();
        engineRef.current = null;
        if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
        ringTimerRef.current = null;
        callIdRef.current = null;
        setCallId(null);
        setPeer(null);
        setIsCaller(false);
        setEmergency(null);
        setSeconds(0);
        setEndedNote(null);
        setCallAudioPhase("idle");
        toast.message("You're in the emergency chat. Another responder is on the voice call.");
        return;
      }

      const microphoneStream = await primeMicrophone();
      if (!isSosCall) await setCallStatus(id, "connecting");
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
      if (!isSosCall) toast.error(message);
    }
  };

  const decline = async () => {
    const id = callIdRef.current;
    if (!id) return;
    await setCallStatus(id, "declined").catch(() => undefined);
    teardown("Call declined");
  };

  const hangUp = useCallback(async () => {
    const id = callIdRef.current;
    if (!id) return;
    await setCallStatus(id, "ended").catch(() => undefined);
    teardown("Call ended");
  }, [teardown]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    engineRef.current?.setMuted(next);
  }, [muted]);

  const toggleSpeaker = useCallback(() => {
    const next = !speaker;
    setSpeaker(next);
    void engineRef.current?.setSpeaker(next).then((applied) => {
      if (!applied) toast.message("Speaker selection isn't supported on this device.");
    });
  }, [speaker]);

  useEffect(() => {
    setSosInlineCallActions({ toggleMute, toggleSpeaker, hangUp });
    return () => setSosInlineCallActions(null);
  }, [hangUp, toggleMute, toggleSpeaker]);

  useEffect(() => {
    if (!peer?.sosActivityId || !callId || sosCallStatus === "idle" || !isChatRoute()) return;
    setSosInlineCall({
      activityId: peer.sosActivityId,
      callId,
      name: peer.name,
      avatarUrl: peer.avatarUrl,
      safetyRole: peer.safetyRole ?? "Safety contact",
      status: sosCallStatus,
      seconds,
      muted,
      speaker,
    });
  }, [callId, muted, peer, seconds, speaker, sosCallStatus]);

  const inChatSosCall = isChatRoute() && Boolean(peer?.sosActivityId);
  const visible = phase !== "idle" && !inChatSosCall;
  const showInlineSos =
    isChatRoute() &&
    !isCaller &&
    Boolean(peer?.sosActivityId) &&
    (phase === "incoming" ||
      sosCallStatus === "connecting" ||
      sosCallStatus === "connected");
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
    <>
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
          <div className="receiver-shell">
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

            <main className={cn("receiver-scroll", phase === "incoming" && "receiver-scroll-with-dock")}>
              <div className="mx-auto w-full max-w-[1320px] px-3 py-3 sm:px-5 sm:py-4">
                <div className="receiver-workspace">
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

                    {phase !== "incoming" && <div className="receiver-call-actions">
                      {phase === "ended" ? <p className="col-span-2 py-3 text-center text-sm font-bold">{endedNote ?? "Call ended"}</p> : <div className="col-span-2 flex items-center justify-center gap-8 py-1"><CallAction label={muted ? "Unmute" : "Mute"} tone="muted" active={muted} onClick={toggleMute}>{muted ? <MicOff /> : <Mic />}</CallAction><CallAction label={speaker ? "Speaker" : "Earpiece"} tone="muted" active={speaker} onClick={toggleSpeaker}>{speaker ? <Volume2 /> : <VolumeX />}</CallAction><CallAction label="End" tone="destructive" onClick={() => void hangUp()}><PhoneOff /></CallAction></div>}
                    </div>}
                  </section>

                  {emergency && !isCaller && phase !== "ended" && <>
                    <section className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Emergency quick actions">
                      <a
                        href={callerPoint ? `https://www.google.com/maps/dir/?api=1&destination=${callerPoint.lat},${callerPoint.lng}` : undefined}
                        target={callerPoint ? "_blank" : undefined}
                        rel={callerPoint ? "noreferrer" : undefined}
                        aria-disabled={!callerPoint}
                        onClick={(event) => {
                          if (!callerPoint) event.preventDefault();
                        }}
                        className={cn(
                          "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:bg-accent",
                          !callerPoint && "cursor-not-allowed opacity-55",
                        )}
                      >
                        <Navigation className="h-4 w-4" />
                        Open in Google Maps
                      </a>
                      <Button
                        variant="outline"
                        disabled={!callerPoint}
                        onClick={() => void copyCallerGps()}
                        className="min-h-12 justify-center gap-2 rounded-xl text-sm font-bold"
                      >
                        <Clipboard className="h-4 w-4" />
                        Copy GPS coordinates
                      </Button>
                    </section>

                    <section id="receiver-map" className="receiver-surface" aria-label="Rescue navigation">
                      {helpSearchPoint ? (
                        <ResponderNavigation
                          caller={callerPoint ?? helpSearchPoint}
                          callerName={peer?.name?.split(" ")[0] ?? "the caller"}
                          searchCenter={helpSearchPoint}
                          anchorLocation={callerPoint}
                          helpPlaces={helpPlaces}
                          helpLoading={helpLoading}
                          currentLocation={receiverPoint ?? undefined}
                          trackLocation={phase === "active" && Boolean(callerPoint)}
                        />
                      ) : (
                        <div
                          role="status"
                          className="relative flex min-h-[22rem] flex-col items-center justify-center overflow-hidden rounded-2xl border border-gold/25 bg-gold/[0.06] px-5 text-center"
                        >
                          <span className="absolute h-24 w-24 animate-ping rounded-full border border-gold/35" />
                          <span className="relative grid h-12 w-12 place-items-center rounded-full border border-gold/35 bg-gold/10 text-gold">
                            <Crosshair className="h-5 w-5" />
                          </span>
                          <p className="relative mt-4 text-sm font-bold text-foreground">
                            {receiverLocationError
                              ? "Nearby help location unavailable"
                              : phase === "active"
                                ? "Getting responder GPS…"
                                : emergency.location_requested
                                  ? "Acquiring caller GPS…"
                                  : "Caller location isn’t shared"}
                          </p>
                          <p className="relative mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                            {receiverLocationError ??
                              (phase === "active"
                                ? "Nearby facilities will appear when your location is available."
                                : "Answer the call to search nearby help using your location, or wait for the caller to share GPS.")}
                          </p>
                        </div>
                      )}
                    </section>
                  </>}

                  {isCaller && peer?.sosActivityId && !peer.shareLocation && phase !== "ended" && (
                    <section className="receiver-surface" aria-label="Nearby directions unavailable">
                      <p className="text-[12px] font-semibold text-muted-foreground">
                        Live directions are unavailable because location sharing is off for this SOS.
                      </p>
                    </section>
                  )}

                  {isCaller && peer?.sosActivityId && peer.shareLocation && !localPoint && phase !== "ended" && (
                    <section className="receiver-surface" aria-label="Waiting for live location">
                      <p className="text-[12px] font-semibold text-muted-foreground">
                        {localLocationError ?? "Waiting for a current GPS position to find nearby help."}
                      </p>
                    </section>
                  )}

                  {isCaller && peer?.sosActivityId && peer.shareLocation && localPoint && phase !== "ended" && (
                    <section id="receiver-route" className="receiver-surface" aria-label="Directions to nearby help">
                      <div className="receiver-section-head">
                        <span className="h-2 w-2 rounded-full bg-success" />
                        <div className="min-w-0"><p>Directions to nearby help</p><span>Nearest facility · live route updates</span></div>
                      </div>
                      <ResponderNavigation
                        caller={localPoint}
                        callerName="nearby help"
                        initialLocation={localPoint}
                        currentLocation={localPoint}
                        trackLocation={false}
                        helpPlaces={helpPlaces}
                        searchCenter={localPoint}
                        helpLoading={helpLoading}
                      />
                      {helpLoading && helpPlaces.length === 0 && <p className="mt-3 text-[11px] text-muted-foreground">Finding hospitals, police stations, and clinics nearby…</p>}
                    </section>
                  )}
                </div>
              </div>
            </main>

            {phase === "incoming" && <motion.div
              className="receiver-action-dock"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="receiver-action-dock-inner">
                <Button variant="outline" onClick={() => void decline()} className="receiver-decline"><span className="grid h-9 w-9 place-items-center rounded-full bg-background"><PhoneOff /></span><span className="text-left"><strong className="block">Decline</strong><small className="hidden font-normal opacity-60 sm:block">Ignore this call</small></span></Button>
                <Button onClick={() => void answer()} className="receiver-answer answer-breathe"><span className="receiver-answer-icon grid h-9 w-9 place-items-center rounded-full bg-success-foreground text-success"><Phone /></span><span className="min-w-0 text-left"><strong className="block truncate">Answer Emergency Call</strong><small className="block truncate font-normal opacity-80">Connect with {peer?.name ?? firstName}</small></span></Button>
              </div>
            </motion.div>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    {showInlineSos && (
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        aria-label={
          sosCallStatus === "connected"
            ? "Connected SOS call"
            : phase === "incoming"
              ? "Incoming SOS call"
              : "Connecting SOS call"
        }
        className={cn(
          "fixed inset-x-3 bottom-24 z-[75] mx-auto max-w-2xl space-y-2 rounded-2xl border bg-card p-3 text-foreground shadow-xl",
          sosCallStatus === "connected"
            ? "border-success/35"
            : "border-destructive/30",
        )}
      >
        <div className="flex items-center gap-2">
          <Avatar name={peer?.name ?? "Allma member"} url={peer?.avatarUrl ?? null} size={38} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{peer?.name ?? "Allma member"}</p>
            <p className="text-[10px] text-muted-foreground">
              {sosCallStatus === "connected"
                ? `${peer?.safetyRole || "Safety contact"} · ${formatDuration(seconds)}`
                : phase === "incoming"
                  ? "Emergency call · Safety network"
                  : "Connecting your emergency call…"}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-success/35 bg-success/10 px-2 py-1 text-[9px] font-bold text-success">
            {sosCallStatus === "connected" ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />
                  <span className="relative h-2 w-2 rounded-full bg-success" />
                </span>
                CONNECTED
              </>
            ) : phase === "incoming" ? (
              "INCOMING"
            ) : (
              "CONNECTING"
            )}
          </span>
        </div>
        {sosCallStatus === "connected" ? (
          <>
            <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-2">
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? "Unmute" : "Mute"}
                className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-2 text-xs font-semibold"
              >
                {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {muted ? "Unmute" : "Mute"}
              </button>
              <button
                type="button"
                onClick={toggleSpeaker}
                aria-label={speaker ? "Switch to earpiece" : "Switch to speaker"}
                className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-2 text-xs font-semibold"
              >
                {speaker ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                {speaker ? "Speaker" : "Earpiece"}
              </button>
              <button
                type="button"
                onClick={() => void hangUp()}
                className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-destructive px-2 text-xs font-bold text-destructive-foreground"
              >
                <PhoneOff className="h-4 w-4" /> End Call
              </button>
            </div>
            <div className="border-t border-border/60 pt-2">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Caller location and nearby help
              </p>
              {callerPoint ? (
                <LiveLocationMap
                  location={{
                    lat: callerPoint.lat,
                    lng: callerPoint.lng,
                    accuracy: emergency?.accuracy_m,
                    address: emergency?.area ?? undefined,
                  }}
                  places={helpPlaces}
                  heightClassName="h-44 sm:h-52"
                />
              ) : (
                <p className="rounded-xl border border-border/60 bg-background px-3 py-2 text-xs text-muted-foreground">
                  The caller has not shared their location. Nearby help will appear when coordinates are available.
                </p>
              )}
              {helpLoading && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Finding nearby hospitals and police…
                </p>
              )}
            </div>
          </>
        ) : phase === "incoming" ? (
          <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-2">
            <button
              type="button"
              onClick={() => void decline()}
              className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-semibold"
            >
              <PhoneOff className="h-4 w-4" /> Decline
            </button>
            <button
              type="button"
              onClick={() => void answer()}
              className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-success px-3 text-sm font-bold text-success-foreground"
            >
              <Phone className="h-4 w-4" /> Answer SOS
            </button>
          </div>
        ) : null}
      </motion.section>
    )}
    </>
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
