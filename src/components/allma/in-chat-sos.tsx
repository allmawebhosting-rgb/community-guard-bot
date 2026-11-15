import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MapPin, Phone, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { EmergencyCallEscalation } from "@/components/allma/sos/emergency-call-escalation";
import { notifySosActivity } from "@/lib/push.functions";
import { primeMicrophone } from "@/lib/zego-call";

type Line = { number: string };
type Phase = "idle" | "countdown" | "active" | "ended";
const COUNTDOWN = 3;
const TYPE_MAP = { medical: "medical", crime: "crime", fire: "fire" } as const;

function lineLabel(n: string) {
  return n === "999" ? "Police" : n === "911" ? "Ambulance" : "Toll-free";
}

/**
 * SOS inside the chat. Only starts when the user taps Press SOS, then a 3-second
 * cancellable countdown. Every status shown comes from the real SOS record and call rows.
 */
export function InChatSos({ type, lines }: { type: keyof typeof TYPE_MAP; lines: Line[] }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [left, setLeft] = useState(COUNTDOWN);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [mic, setMic] = useState<MediaStream | undefined>();
  const [loc, setLoc] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  function startCountdown() {
    if (!user) { toast.error("Sign in so Allma can alert your safety network."); return; }
    setLeft(COUNTDOWN);
    setPhase("countdown");
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
    setPhase("active");
    setSaving(true);
    void primeMicrophone().then(setMic).catch(() => toast.error("Microphone access is needed for SOS calls."));
    const pos = await getPosition();
    const coords = pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy } : null;
    setLoc(coords);
    const { data, error } = await supabase
      .from("safety_activity")
      .insert({
        user_id: user.id,
        activity_type: "sos_activated",
        title: "Emergency SOS activated",
        summary: `SOS activated from chat (${type}).`,
        severity: "critical",
        sos_status: "active",
        activated_at: new Date().toISOString(),
        location_text: coords ? "Live GPS location" : "Location pending",
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        details: {
          channel: "chat",
          emergency_type: TYPE_MAP[type],
          location_consent: !!coords,
          responder_notification_consent: true,
          accuracy_m: coords?.acc ?? null,
          activation_mode: "manual",
        } as never,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      toast.error("SOS could not be started. Call 999 or 112 now.");
      setPhase("idle");
      return;
    }
    setActivityId(data.id);
    setStartedAt(Date.now());
    void notifySosActivity({ data: { activityId: data.id } }).catch(() => {});
  }

  async function endSos() {
    if (activityId) {
      const { error } = await supabase
        .from("safety_activity")
        .update({
          activity_type: "sos_resolved",
          title: "Emergency SOS ended",
          severity: "info",
          summary: "SOS was stopped by the user from chat.",
          sos_status: "cancelled",
          ended_at: new Date().toISOString(),
        })
        .eq("id", activityId);
      if (error) toast.error("SOS stopped here, but the server could not be updated.");
    }
    mic?.getTracks().forEach((t) => t.stop());
    setEndedAt(Date.now());
    setPhase("ended");
  }

  const time = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
  const dials = (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {lines.map((h) => (
        <a key={h.number} href={`tel:${h.number}`} className="flex items-center justify-center gap-2 rounded-xl border border-destructive/35 bg-destructive/5 px-3 py-2.5 text-[15px] font-semibold text-destructive">
          <Phone className="h-4 w-4 shrink-0" /> Call {h.number} {lineLabel(h.number)}
        </a>
      ))}
    </div>
  );

  if (phase === "ended") {
    const mins = startedAt && endedAt ? Math.max(1, Math.round((endedAt - startedAt) / 60000)) : null;
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/60 px-3.5 py-2.5 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>SOS ended at {time(endedAt)}{mins ? ` · ${mins} min` : ""}</span>
      </div>
    );
  }

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
      <div className="space-y-3 rounded-2xl border border-destructive/40 bg-card p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[15px] font-bold text-destructive">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" /></span>
            {saving ? "Starting SOS…" : "SOS active"}
          </p>
          <span className="text-xs text-muted-foreground">{time(startedAt)}</span>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          {saving ? "Getting your location…" : loc ? `Location shared · ±${Math.round(loc.acc)} m` : "Location not available"}
        </p>
        {saving ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Saving your SOS…</div>
        ) : (
          <EmergencyCallEscalation activityId={activityId} emergencyType={TYPE_MAP[type]} microphoneStream={mic} shareLocation={!!loc} compact />
        )}
        {dials}
        <button type="button" onClick={() => void endSos()} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted px-4 py-3 text-[15px] font-semibold text-foreground disabled:opacity-50">
          <X className="h-4 w-4" /> I'm safe · End SOS
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <button type="button" onClick={startCountdown} className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-3.5 text-base font-semibold text-destructive-foreground active:scale-[0.98]">
        <ShieldAlert className="h-5 w-5 shrink-0" /> Press SOS
      </button>
      {dials}
    </div>
  );
}
