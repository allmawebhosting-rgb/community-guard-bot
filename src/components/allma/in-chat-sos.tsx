import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Building2,
  CheckCircle2,
  Flame,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  Navigation2,
  Phone,
  PhoneOff,
  Pill,
  Shield,
  ShieldAlert,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { EmergencyCallEscalation } from "@/components/allma/sos/emergency-call-escalation";
import { Avatar } from "@/components/allma/safety-network/add-safety-contact";
import { LiveLocationMap } from "@/components/allma/live-location-map";
import {
  HELP_KIND_COLOR,
  directionsUrl,
  helpKind,
  type HelpPlace,
} from "@/components/allma/nearby-help-list";
import { endSosEscalation } from "@/lib/sos-escalation-controller";
import { notifySosActivity } from "@/lib/push.functions";
import { getNearbyPlaces } from "@/lib/places.functions";
import { runSosInlineCallAction, useSosInlineCall } from "@/lib/sos-inline-call";
import { primeMicrophone } from "@/lib/zego-call";
import { setActiveSos } from "@/lib/sos-active";
import { peekActiveChatThread } from "@/lib/active-chat-thread";
import { createThread, type ThreadSummary } from "@/lib/threads";

type Line = { number: string };
type Phase = "idle" | "countdown" | "active" | "ended";
const COUNTDOWN = 3;
const TYPE_MAP = { medical: "medical", crime: "crime", fire: "fire", other: "other" } as const;

function isMissingSosColumnError(error: unknown, columns: readonly string[]) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };
  if (candidate.code === "PGRST204") return true;
  const message = [candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return columns.some((column) => message.includes(column.toLowerCase()));
}

function lineLabel(n: string) {
  return n === "999" ? "Police" : n === "911" ? "Ambulance" : "Toll-free";
}

function compactDistance(meters: number) {
  return meters < 950 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}

/**
 * SOS inside the chat. Only starts when the user taps Activate SOS, then a 3-second
 * cancellable countdown. Every status shown comes from the real SOS record and call rows.
 */
export function InChatSos({
  type,
  lines,
  threadId,
  existingActivityId,
  existingActive,
  sharedLocation,
  canManage = true,
  requestActivation = false,
  hideIdle = false,
  offerMode = false,
  onActivityStarted,
  onActivityEnded,
  onEnsureThread,
}: {
  type: keyof typeof TYPE_MAP;
  lines: Line[];
  threadId?: string | null;
  existingActivityId?: string | null;
  existingActive?: boolean;
  sharedLocation?: { latitude: number; longitude: number; accuracy_m: number | null } | null;
  canManage?: boolean;
  requestActivation?: boolean;
  hideIdle?: boolean;
  /** Softer CTA: "Would you like to alert your Safety Network?" + Activate SOS */
  offerMode?: boolean;
  onActivityStarted?: (activityId: string, card: HTMLDivElement | null) => void;
  onActivityEnded?: (activityId: string) => void;
  /** Parent creates/opens the SAME chat thread so SOS never jumps to a blank page. */
  onEnsureThread?: () => Promise<string>;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [autoThreadId, setAutoThreadId] = useState<string | null>(null);
  const effectiveThreadId = threadId || autoThreadId;
  const effectiveThreadIdRef = useRef<string | null>(effectiveThreadId);
  const autoThreadIdRef = useRef<string | null>(null);
  const createdThreadRef = useRef(false);
  const threadCreationRef = useRef<Promise<string> | null>(null);
  const threadCreationErrorShownRef = useRef(false);
  const [phase, setPhase] = useState<Phase>(
    existingActivityId ? (existingActive ? "active" : "ended") : "idle",
  );
  const [left, setLeft] = useState(COUNTDOWN);
  const [activityId, setActivityId] = useState<string | null>(existingActivityId ?? null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [mic, setMic] = useState<MediaStream | undefined>();
  const [loc, setLoc] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [places, setPlaces] = useState<HelpPlace[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [mapVisible, setMapVisible] = useState(true);
  const [networkNotified, setNetworkNotified] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [ending, setEnding] = useState(false);
  const inlineCall = useSosInlineCall();
  const timer = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<Record<string, unknown>>({});
  const lastLocationSync = useRef<{ lat: number; lng: number; at: number } | null>(null);

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  useEffect(() => {
    effectiveThreadIdRef.current = effectiveThreadId;
  }, [effectiveThreadId]);

  useEffect(() => {
    if (!existingActivityId || phase === "countdown") return;
    setActivityId(existingActivityId);
    setPhase(existingActive ? "active" : "ended");
    if (existingActive) setStartedAt((value) => value ?? Date.now());
    if (sharedLocation) {
      setLoc({
        lat: sharedLocation.latitude,
        lng: sharedLocation.longitude,
        acc: sharedLocation.accuracy_m ?? 0,
      });
    }
  }, [existingActivityId, existingActive, phase, sharedLocation]);

  // Drive the animated header (logo area) from this real SOS row.
  useEffect(() => {
    if (!canManage || phase !== "active" || !activityId) return;
    setActiveSos({ activityId, type });
    return () => setActiveSos(null);
  }, [activityId, canManage, phase, type]);

  useEffect(() => {
    if (phase === "active" && activityId) onActivityStarted?.(activityId, cardRef.current);
  }, [activityId, onActivityStarted, phase]);

  useEffect(() => {
    if (!canManage || phase !== "active" || !activityId || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          acc: position.coords.accuracy,
        };
        setLoc({
          ...next,
        });
        const previous = lastLocationSync.current;
        const movedMeters = previous
          ? Math.hypot(
              (next.lat - previous.lat) * 111_000,
              (next.lng - previous.lng) * 111_000 * Math.cos((next.lat * Math.PI) / 180),
            )
          : Number.POSITIVE_INFINITY;
        const now = Date.now();
        if (!previous || movedMeters >= 50 || now - previous.at >= 15_000) {
          lastLocationSync.current = { lat: next.lat, lng: next.lng, at: now };
          void supabase
            .from("safety_activity")
            .update({
              latitude: next.lat,
              longitude: next.lng,
              location_text: "Live GPS location",
            })
            .eq("id", activityId)
            .eq("user_id", user?.id ?? "")
            .then(({ error }) => {
              if (error) console.warn("SOS live location could not be shared", error);
            });
        }
      },
      (error) => {
        if (error.code !== 1) console.warn("SOS live location update unavailable", error);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [activityId, canManage, phase, user?.id]);

  const placeSearchKey = loc ? `${loc.lat.toFixed(3)},${loc.lng.toFixed(3)}` : null;
  useEffect(() => {
    if (!placeSearchKey) {
      setPlaces([]);
      setPlacesLoading(false);
      setPlacesError(false);
      return;
    }
    const [latitude, longitude] = placeSearchKey.split(",").map(Number);
    let active = true;
    setPlacesLoading(true);
    setPlacesError(false);
    void getNearbyPlaces({
      data: {
        latitude,
        longitude,
        radiusMeters: 10000,
        limit: 12,
        types: ["hospital", "medical_clinic", "doctor", "police", "fire_station", "pharmacy"],
      },
    })
      .then((results) => {
        if (!active) return;
        const next = (results ?? [])
          .map((place) => ({
            id: place.id,
            name: place.name,
            type: place.type,
            address: place.address,
            phone: place.phone,
            distance_m: place.distance_m,
            latitude: place.latitude,
            longitude: place.longitude,
          }))
          .sort((a, b) => a.distance_m - b.distance_m);
        setPlaces(next);
        setPlacesError(false);
        setSelectedPlaceId((current) =>
          current && next.some((place) => place.id === current) ? current : next[0]?.id ?? null,
        );
      })
      .catch((error) => {
        if (!active) return;
        console.warn("Nearby SOS help could not be loaded", error);
        setPlaces([]);
        setPlacesError(true);
      })
      .finally(() => {
        if (active) setPlacesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [placeSearchKey]);

  function ensureEmergencyThread() {
    if (effectiveThreadIdRef.current) {
      return Promise.resolve(effectiveThreadIdRef.current);
    }
    if (threadCreationRef.current) return threadCreationRef.current;

    const creation = (async () => {
      // Parent chat keeps the open messages when promoting a guest chat into a saved thread.
      if (onEnsureThread) {
        const ensuredId = await onEnsureThread();
        effectiveThreadIdRef.current = ensuredId;
        autoThreadIdRef.current = ensuredId;
        createdThreadRef.current = true;
        setAutoThreadId(ensuredId);
        return ensuredId;
      }

      const remembered = peekActiveChatThread();
      if (remembered) {
        effectiveThreadIdRef.current = remembered;
        return remembered;
      }

      // Fallback only: never invent a blank "Emergency SOS" page.
      const thread = await createThread("Safety conversation");
      effectiveThreadIdRef.current = thread.id;
      autoThreadIdRef.current = thread.id;
      createdThreadRef.current = true;
      setAutoThreadId(thread.id);
      queryClient.setQueryData<ThreadSummary[]>(["threads"], (threads = []) => [
        thread,
        ...threads.filter((item) => item.id !== thread.id),
      ]);
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      return thread.id;
    })().finally(() => {
      if (threadCreationRef.current === creation) threadCreationRef.current = null;
    });
    threadCreationRef.current = creation;
    return creation;
  }

  function stayOnConversation(activeThreadId: string) {
    // Parent continuity helper already routed while preserving messages.
    if (onEnsureThread) return;
    if (!createdThreadRef.current) return;
    if (typeof window !== "undefined" && window.location.pathname === `/chat/${activeThreadId}`) {
      return;
    }
    void navigate({
      to: "/chat/$threadId",
      params: { threadId: activeThreadId },
      replace: true,
    });
  }

  function showThreadCreationError() {
    if (threadCreationErrorShownRef.current) return;
    threadCreationErrorShownRef.current = true;
    toast.error("Could not create an emergency chat. Call 999 or 112 now.");
  }

  function startCountdown() {
    if (!user) { toast.error("Sign in so Allma can alert your safety network."); return; }
    threadCreationErrorShownRef.current = false;
    setLeft(COUNTDOWN);
    setNetworkNotified(null);
    setMapVisible(true);
    setPhase("countdown");
    if (!effectiveThreadIdRef.current) {
      void ensureEmergencyThread().catch(() => {
        if (timer.current) {
          window.clearInterval(timer.current);
          timer.current = null;
          setPhase("idle");
        }
        showThreadCreationError();
      });
    }
    timer.current = window.setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          if (timer.current) window.clearInterval(timer.current);
          timer.current = null;
          void activate();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  function abortCountdown() {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setPhase("idle");
  }

  useEffect(() => {
    if (!requestActivation || !canManage || existingActive) return;
    if (phase === "idle") {
      startCountdown();
    } else if (phase === "ended") {
      setActivityId(null);
      setPhase("idle");
      startCountdown();
    }
  }, [canManage, existingActive, phase, requestActivation]);

  function getPosition(): Promise<GeolocationPosition | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
        enableHighAccuracy: true, timeout: 8000, maximumAge: 15000,
      });
    });
  }

  async function activate() {
    if (!user) return;
    setSaving(true);
    let activeThreadId: string;
    try {
      activeThreadId = await ensureEmergencyThread();
    } catch (error) {
      console.error("Could not create an emergency thread for SOS", error);
      setSaving(false);
      setPhase("idle");
      showThreadCreationError();
      return;
    }
    setPhase("active");
    void primeMicrophone().then(setMic).catch(() => undefined);

    if (activeThreadId) {
      try {
        const { data: contextRows, error: contextError } = await supabase.rpc(
          "get_chat_thread_context",
          { p_thread_id: activeThreadId },
        );
        if (!contextError) {
          const existing = contextRows?.[0];
          if (existing?.sos_active && existing.sos_activity_id) {
            setActivityId(existing.sos_activity_id);
            setStartedAt(Date.now());
            setSaving(false);
            stayOnConversation(activeThreadId);
            return;
          }
        }
      } catch (error) {
        console.warn("Could not check for an existing SOS session", error);
      }
    }

    const pos = await getPosition();
    const coords = pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy } : null;
    setLoc(coords);
    const activatedAt = new Date().toISOString();
    const details = {
      channel: "chat",
      emergency_type: TYPE_MAP[type],
      thread_id: activeThreadId,
      location_consent: !!coords,
      responder_notification_consent: true,
      accuracy_m: coords?.acc ?? null,
      activation_mode: "manual",
    };
    detailsRef.current = details;
    const baseInsert = {
      user_id: user.id,
      activity_type: "sos_activated" as const,
      title: "Emergency SOS activated",
      summary: `SOS activated from chat (${type}).`,
      severity: "critical",
      sos_status: "active",
      activated_at: activatedAt,
      location_text: coords ? "Live GPS location" : "Location pending",
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      thread_id: activeThreadId,
      details: details as never,
    };
    const insertResult = await supabase
      .from("safety_activity")
      .insert(baseInsert)
      .select("id")
      .single();
    let { data, error } = insertResult;
    if (error && isMissingSosColumnError(error, ["thread_id"])) {
      const { thread_id: _ignored, ...withoutThreadColumn } = baseInsert;
      const fallbackThread = await supabase
        .from("safety_activity")
        .insert(withoutThreadColumn)
        .select("id")
        .single();
      data = fallbackThread.data;
      error = fallbackThread.error;
    }
    if (error && isMissingSosColumnError(error, ["activated_at", "sos_status"])) {
      const { sos_status: _s, activated_at: _a, thread_id: threadColumn, ...rest } = baseInsert;
      const fallbackResult = await supabase
        .from("safety_activity")
        .insert({
          ...rest,
          ...(threadColumn ? { thread_id: threadColumn } : {}),
          details: { ...details, sos_status: "active", activated_at: activatedAt } as never,
        })
        .select("id")
        .single();
      data = fallbackResult.data;
      error = fallbackResult.error;
    }
    if (error && activeThreadId && (error as { code?: string }).code === "23505") {
      const { data: contextRows, error: contextError } = await supabase.rpc(
        "get_chat_thread_context",
        { p_thread_id: activeThreadId },
      );
      const existing = !contextError ? contextRows?.[0] : null;
      if (existing?.sos_active && existing.sos_activity_id) {
        setActivityId(existing.sos_activity_id);
        setStartedAt(Date.now());
        setSaving(false);
        stayOnConversation(activeThreadId);
        return;
      }
    }
    setSaving(false);
    if (error || !data) {
      console.error("SOS activation insert failed", error);
      toast.error("SOS could not be started. Call 999 or 112 now.");
      setPhase("idle");
      return;
    }
    setActivityId(data.id);
    setStartedAt(Date.now());
    void notifySosActivity({ data: { activityId: data.id } }).catch(() => {});
    stayOnConversation(activeThreadId);
  }

  async function endSos() {
    if (ending || !canManage) return;
    setEnding(true);
    const hangUp = runSosInlineCallAction("hangUp");
    if (activityId) await endSosEscalation(activityId);
    await hangUp;
    const endedAtIso = new Date().toISOString();
    if (activityId) {
      const updateResult = await supabase
        .from("safety_activity")
        .update({
          activity_type: "sos_resolved",
          title: "Emergency SOS ended",
          severity: "info",
          summary: "SOS was stopped by the user from chat.",
          sos_status: "cancelled",
          ended_at: endedAtIso,
          details: {
            ...detailsRef.current,
            sos_status: "cancelled",
            ended_at: endedAtIso,
          } as never,
        })
        .eq("id", activityId);
      let { error } = updateResult;
      if (error && isMissingSosColumnError(error, ["ended_at", "sos_status"])) {
        const fallbackResult = await supabase
          .from("safety_activity")
          .update({
            activity_type: "sos_resolved",
            title: "Emergency SOS ended",
            summary: "SOS was stopped by the user from chat.",
            details: {
              ...detailsRef.current,
              sos_status: "cancelled",
              ended_at: endedAtIso,
            } as never,
          })
          .eq("id", activityId);
        error = fallbackResult.error;
      }
      if (error) toast.error("SOS stopped here, but the server could not be updated.");
      try {
        const result = await notifySosActivity({ data: { activityId, status: "resolved" } });
        setNetworkNotified(result.delivered > 0);
        if (result.delivered === 0) toast.message("SOS ended, but no safety-network push notification was delivered.");
      } catch {
        setNetworkNotified(false);
        toast.error("SOS ended, but the safety network could not be notified.");
      }
    }
    mic?.getTracks().forEach((t) => t.stop());
    setEndedAt(Date.now());
    setPhase("ended");
    if (activityId) onActivityEnded?.(activityId);
    setEnding(false);
  }

  const time = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
  const compactPlaces = places.slice(0, 5);
  const activeCall = inlineCall?.activityId === activityId ? inlineCall : null;
  const placeIcon = (kind: ReturnType<typeof helpKind>) => {
    if (kind === "police") return Shield;
    if (kind === "fire") return Flame;
    if (kind === "pharmacy") return Pill;
    return Building2;
  };
  const dials = (
    <div className="grid grid-cols-2 gap-1.5">
      {lines.map((h) => (
        <a
          key={h.number}
          href={`tel:${h.number}`}
          aria-label={`Call ${h.number} ${lineLabel(h.number)}`}
          className="flex min-h-8 items-center justify-center gap-1 rounded-lg border border-destructive/35 bg-destructive/5 px-2 py-1 text-[11px] font-semibold text-destructive"
        >
          <Phone className="h-3.5 w-3.5 shrink-0" /> Call {h.number} {lineLabel(h.number)}
        </a>
      ))}
    </div>
  );

  if (phase === "countdown") {
    return (
      <div className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-3.5" role="alert">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-destructive">
          <ShieldAlert className="h-5 w-5" /> Starting SOS in {left}s…
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-destructive/15">
          <div className="h-full bg-destructive transition-[width] duration-1000 ease-linear" style={{ width: `${((COUNTDOWN - left) / COUNTDOWN) * 100}%` }} />
        </div>
        <p className="text-sm text-muted-foreground">Your safety network will be alerted. Tap cancel if this was a mistake.</p>
        <button type="button" onClick={abortCountdown} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-[15px] font-semibold text-foreground">
          <X className="h-4 w-4" /> Cancel
        </button>
      </div>
    );
  }

  if (phase === "active") {
    return (
      <div ref={cardRef} className="space-y-2 rounded-xl border border-destructive/40 bg-card p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-destructive">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
            </span>
            {saving ? "Starting SOS…" : "SOS active"}
            <span className="font-medium text-muted-foreground">{time(startedAt)}</span>
          </p>
          <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {saving
                ? "Getting location…"
                : loc
                  ? `Location shared · ±${Math.round(loc.acc)} m`
                  : "Location unavailable"}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setMapVisible((visible) => !visible)}
            aria-expanded={mapVisible}
            className="ml-auto rounded-md px-1.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted"
          >
            {mapVisible ? "Hide map" : "Show map"}
          </button>
        </div>

        {saving ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving your SOS…
          </div>
        ) : activeCall ? (
          <section
            id={`sos-call-${activityId}`}
            aria-label="Active emergency call"
            className="overflow-hidden rounded-xl border border-success/40 bg-gradient-to-br from-success/[0.12] via-card to-success/[0.04] p-3 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-success/15 p-1 ring-2 ring-success/30 ring-offset-2 ring-offset-card">
                <Avatar name={activeCall.name} url={activeCall.avatarUrl} size={48} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">{activeCall.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="max-w-full truncate rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                  {activeCall.safetyRole || "Safety Network"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {activeCall.status === "connected" ? "Connected" : "Joining"}
                  </span>
                </div>
              </div>
              <span
                className="shrink-0 rounded-full border border-success/40 bg-success/10 px-2 py-1 text-[9px] font-bold tracking-wide text-success"
                aria-live="polite"
              >
                {activeCall.status === "connected" ? "CONNECTED" : "CONNECTING"}
              </span>
            </div>

            {activeCall.status === "connected" ? (
              <>
                <div className="mt-3 flex items-center justify-between rounded-lg bg-success/[0.08] px-3 py-2">
                  <span className="flex items-end gap-[3px]" aria-label="Call audio equalizer">
                    {[8, 14, 10, 17, 11].map((height, index) => (
                      <span
                        key={index}
                        className="sos-equalizer-bar w-[3px] rounded-full bg-success"
                        style={{ height, animationDelay: `${index * 110}ms` }}
                      />
                    ))}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-success">
                    Live Safety Network call
                  </span>
                  <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                    {String(Math.floor(activeCall.seconds / 60)).padStart(2, "0")}:
                    {String(activeCall.seconds % 60).padStart(2, "0")}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => void runSosInlineCallAction("toggleMute")}
                    aria-label={activeCall.muted ? "Unmute call" : "Mute call"}
                    className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-background/80 px-2 text-[11px] font-semibold hover:bg-muted"
                  >
                    {activeCall.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {activeCall.muted ? "Unmute" : "Mute"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runSosInlineCallAction("toggleSpeaker")}
                    aria-label={activeCall.speaker ? "Use earpiece" : "Use speaker"}
                    className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-background/80 px-2 text-[11px] font-semibold hover:bg-muted"
                  >
                    {activeCall.speaker ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                    Speaker
                  </button>
                  <button
                    type="button"
                    onClick={() => void runSosInlineCallAction("hangUp")}
                    aria-label="End emergency call"
                    className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-destructive px-2 text-[11px] font-bold text-destructive-foreground hover:opacity-90"
                  >
                    <PhoneOff className="h-4 w-4" />
                    End
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-background/70 px-3 py-2 text-[11px] font-semibold text-foreground">
                <span className="relative h-2.5 w-2.5 shrink-0">
                  <span className="absolute inset-0 animate-ping rounded-full bg-success/70" />
                  <span className="relative block h-2.5 w-2.5 rounded-full bg-success" />
                </span>
                Escalating emergency call to Safety Network...
              </div>
            )}
          </section>
        ) : canManage ? (
          <EmergencyCallEscalation
            activityId={activityId}
            emergencyType={TYPE_MAP[type]}
            microphoneStream={mic}
            shareLocation={!!loc}
            compact
          />
        ) : (
          <p className="rounded-lg bg-muted/50 px-2.5 py-2 text-[11px] text-muted-foreground">
            SOS is active. You can support through this shared conversation.
          </p>
        )}

        {mapVisible && (
          <section aria-label="Nearby emergency help" className="space-y-1.5">
            {loc ? (
              <LiveLocationMap
                location={{ lat: loc.lat, lng: loc.lng, accuracy: loc.acc }}
                badge="Your location"
                heightClassName="h-40"
                places={places}
                selectedPlaceId={selectedPlaceId}
                onSelectPlace={setSelectedPlaceId}
                mapTypeId="hybrid"
                compact
              />
            ) : (
              <p className="rounded-lg bg-muted/50 px-2.5 py-2 text-[11px] text-muted-foreground">
                {saving || placesLoading ? "Waiting for GPS to show nearby help…" : "Turn on location access to show nearby help."}
              </p>
            )}
            {loc ? (
              <div className="overflow-hidden rounded-lg border border-border/70">
                <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-2.5 py-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Nearby help
                  </p>
                  {placesLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Finding nearby help" />
                  ) : places.length > 0 ? (
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {places.length} found
                    </span>
                  ) : null}
                </div>
                {placesLoading && places.length === 0 ? (
                  <p className="px-2.5 py-2 text-[11px] text-muted-foreground">Finding hospitals and police nearby…</p>
                ) : placesError && places.length === 0 ? (
                  <p className="px-2.5 py-2 text-[11px] text-muted-foreground">
                    Nearby help could not be loaded. Check your connection and try again.
                  </p>
                ) : compactPlaces.length === 0 ? (
                  <p className="px-2.5 py-2 text-[11px] text-muted-foreground">
                    No hospitals or police found nearby yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {compactPlaces.map((place) => {
                      const kind = helpKind(place.type, place.name);
                      const Icon = placeIcon(kind);
                      const selected = selectedPlaceId === place.id;
                      return (
                        <li key={place.id}>
                          <div
                            className={`flex items-center gap-2 px-2 py-1.5 ${selected ? "bg-accent/50" : "bg-card"}`}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedPlaceId(place.id)}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              <span
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
                                style={{
                                  backgroundColor: `${HELP_KIND_COLOR[kind]}1f`,
                                  color: HELP_KIND_COLOR[kind],
                                }}
                              >
                                <Icon className="h-3 w-3" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[11px] font-semibold text-foreground">
                                  {place.name}
                                </span>
                                <span className="block truncate text-[10px] text-muted-foreground">
                                  {compactDistance(place.distance_m)} · {kind}
                                </span>
                              </span>
                            </button>
                            <a
                              href={directionsUrl({ lat: loc.lat, lng: loc.lng }, place)}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Directions to ${place.name}`}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 text-foreground hover:bg-muted"
                            >
                              <Navigation2 className="h-3.5 w-3.5" />
                            </a>
                            {place.phone ? (
                              <a
                                href={`tel:${place.phone.replace(/[^\d+]/g, "")}`}
                                aria-label={`Call ${place.name}`}
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 text-foreground hover:bg-muted"
                              >
                                <Phone className="h-3.5 w-3.5" />
                              </a>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
          </section>
        )}

        <div className="space-y-1.5 border-t border-border/60 pt-2">
          {dials}
          {canManage ? (
            <button
              type="button"
              onClick={() => void endSos()}
              disabled={saving || ending}
              className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-destructive-foreground disabled:opacity-50"
            >
              {ending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              {ending ? "Ending…" : "I'm safe · End SOS"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (phase === "ended" && !canManage) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/60 px-3.5 py-2.5 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>This emergency has ended. The shared conversation remains available.</span>
      </div>
    );
  }

  if (phase === "ended" && canManage) {
    const mins = startedAt && endedAt ? Math.max(1, Math.round((endedAt - startedAt) / 60000)) : null;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/60 px-3.5 py-2.5 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          SOS ended at {time(endedAt)}{mins ? ` · ${mins} min` : ""}
          {networkNotified === true
            ? " · Safety network notified"
            : networkNotified === false
              ? " · Network notification failed"
              : ""}
        </span>
        {requestActivation ? null : (
          <button
            type="button"
            onClick={startCountdown}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-background"
          >
            Start another SOS
          </button>
        )}
      </div>
    );
  }

  if (!canManage) return null;

  if (hideIdle && phase === "idle") return null;

  return (
    <div className="w-full space-y-2">
      {offerMode ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3.5">
          <p className="text-[15px] font-semibold text-foreground">
            Would you like to alert your Safety Network?
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            This keeps your current Allma conversation and invites authorized contacts into it.
          </p>
          <button
            type="button"
            onClick={startCountdown}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-3.5 text-base font-semibold text-destructive-foreground active:scale-[0.98]"
          >
            <ShieldAlert className="h-5 w-5 shrink-0" /> Activate SOS
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={startCountdown}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-3.5 text-base font-semibold text-destructive-foreground active:scale-[0.98]"
        >
          <ShieldAlert className="h-5 w-5 shrink-0" /> Activate SOS
        </button>
      )}
      {dials}
    </div>
  );
}
