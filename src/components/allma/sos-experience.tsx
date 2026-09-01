import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "@tanstack/react-router";
import {
  Siren,
  MapPin,
  Phone,
  Building2,
  Shield,
  ShieldAlert,
  Loader2,
  ChevronRight,
  X,
  Send,
  ArrowLeft,
  CheckCircle2,
  Navigation2,
  Radio,
  Brain,
  Zap,
  AlertTriangle,
  Heart,
  Car,
  UserX,
  Home,
  MoreHorizontal,
  Clock,
  LocateFixed,
  Users,
  Settings2,
  Check,
  Plus,
  Minus,
  Crosshair,
  Copy,
  ExternalLink,
  Mic,
  WifiOff,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { supabase } from "@/integrations/supabase/client";
import { EmergencyCallEscalation } from "@/components/allma/sos/emergency-call-escalation";
import { AllmaVoice } from "@/components/allma/sos/allma-voice";
import { SosRoomStrip } from "@/components/allma/sos/sos-room-strip";
import { LiveLocationMap } from "@/components/allma/live-location-map";
import { cn } from "@/lib/utils";
import { logCheckEvent, resolveSafetyCheck } from "@/lib/smart-sos";
import { notifySosActivity } from "@/lib/push.functions";
import { primeMicrophone } from "@/lib/zego-call";
import { getNearbyPlaces } from "@/lib/places.functions";
import type { NearbyPlace } from "@/lib/places.types";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "idle" | "type-select" | "consent" | "loading" | "help" | "report" | "submitted";
type LocationState = "finding" | "found" | "approximate" | "denied" | "unavailable" | "skipped";
type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

type LocationInfo = {
  address: string;
  suburb: string;
  district: string;
  lat: number;
  lng: number;
  accuracy: number;
  capturedAt: number;
};

type Facility = {
  name: string;
  type: "hospital" | "police" | "ambulance";
  distance: string;
  phone: string;
  address: string;
  lat?: number;
  lng?: number;
};

function formatFacilityDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function nearbyPlaceToFacility(place: NearbyPlace): Facility {
  const value = place.type.toLowerCase();
  const type: Facility["type"] = value.includes("police") ? "police" : "hospital";

  return {
    name: place.name,
    type,
    distance: formatFacilityDistance(place.distance_m),
    phone: place.phone ?? "",
    address: place.address ?? "Nearby location",
    lat: place.latitude,
    lng: place.longitude,
  };
}

async function loadNearbyFacilities(lat: number, lng: number) {
  const results = await getNearbyPlaces({
    data: {
      latitude: lat,
      longitude: lng,
      radiusMeters: 8000,
      limit: 8,
      types: ["hospital", "police", "fire_station", "clinic"],
    },
  });

  const next = results ?? [];
  const hospitals = next
    .filter((place) => !place.type.toLowerCase().includes("police"))
    .map(nearbyPlaceToFacility)
    .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
  const police = next
    .filter((place) => place.type.toLowerCase().includes("police"))
    .map(nearbyPlaceToFacility)
    .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));

  return { hospitals, police };
}

type ResponderStatus = "offered" | "accepted" | "declined" | "en_route" | "arrived" | "cancelled";
type Responder = {
  id: string;
  offerId: string;
  name: string;
  phone: string | null;
  distance: string;
  eta: string;
  status: ResponderStatus;
  verified: boolean;
};

type ResponderOffer = {
  offer_id: string;
  responder_id: string;
  display_name: string;
  phone: string | null;
  distance_m: number;
  status: ResponderStatus;
};

type TrustedContact = {
  id: string;
  name: string;
  phone: string;
  relationship: string | null;
};

type ResponseTarget = {
  level: number;
  label: string;
  detail: string;
  tone: "blue" | "amber" | "violet" | "red";
};

type EscalationAction = "nearest" | "community" | "authority" | "police" | "ambulance";
type UpdateState = "idle" | "saving" | "recorded" | "queued" | "failed";

function createEmergencyId() {
  const year = new Date().getFullYear();
  const suffix = Math.floor(100000 + Math.random() * 900000);
  return `ASA-${year}-${suffix}`;
}

function formatEmergencyTime(timestamp: number | null) {
  if (!timestamp) return "Pending";
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMERGENCY_NUMBERS = [
  {
    label: "Police",
    number: "999",
    gradient: "from-info to-info/70 text-info-foreground",
    glow: "var(--info)",
  },
  {
    label: "Ambulance",
    number: "911",
    gradient: "from-success to-success/70 text-success-foreground",
    glow: "var(--success)",
  },
  {
    label: "Fire Brigade",
    number: "112",
    gradient: "from-alert to-destructive text-alert-foreground",
    glow: "var(--alert)",
  },
  {
    label: "General Emergency",
    number: "112",
    gradient: "from-secondary to-secondary/70 text-secondary-foreground",
    glow: "var(--muted-foreground)",
  },
];

const EMERGENCY_TYPES = [
  { id: "crime", icon: Car, label: "Crime / Theft", color: "text-info", bg: "bg-info/18" },
  {
    id: "medical",
    icon: Heart,
    label: "Medical Emergency",
    color: "text-success",
    bg: "bg-success/18",
  },
  { id: "fire", icon: Zap, label: "Fire", color: "text-alert", bg: "bg-alert/18" },
  {
    id: "attack",
    icon: AlertTriangle,
    label: "Attack / Violence",
    color: "text-destructive",
    bg: "bg-destructive/18",
  },
  {
    id: "accident",
    icon: Car,
    label: "Road Accident",
    color: "text-gold",
    bg: "bg-gold/18",
  },
  {
    id: "missing",
    icon: UserX,
    label: "Missing Person",
    color: "text-trusted",
    bg: "bg-trusted/18",
  },
  {
    id: "domestic",
    icon: Home,
    label: "Domestic Violence",
    color: "text-trusted",
    bg: "bg-trusted/18",
  },
  {
    id: "other",
    icon: MoreHorizontal,
    label: "Other Emergency",
    color: "text-muted-foreground",
    bg: "bg-secondary/60",
  },
];

const COMMUNITY_RADIUS: Record<string, number> = {
  medical: 500,
  accident: 1000,
  fire: 2000,
  missing: 5000,
};

const RESPONSE_PLANS: Record<string, ResponseTarget[]> = {
  crime: [
    {
      level: 1,
      label: "Trusted contacts",
      detail: "Family or friends you have saved",
      tone: "violet",
    },
    {
      level: 3,
      label: "Local authorities",
      detail: "Police and the local security chain",
      tone: "blue",
    },
    { level: 4, label: "Emergency services", detail: "Police emergency line", tone: "red" },
  ],
  medical: [
    {
      level: 1,
      label: "Trusted contacts",
      detail: "A family member or friend you choose",
      tone: "violet",
    },
    {
      level: 2,
      label: "Community responders",
      detail: "Nearby verified first aiders and health workers",
      tone: "amber",
    },
    {
      level: 4,
      label: "Emergency services",
      detail: "Ambulance and hospital support",
      tone: "red",
    },
  ],
  fire: [
    {
      level: 2,
      label: "Community responders",
      detail: "Volunteers alerted only for safe evacuation support",
      tone: "amber",
    },
    {
      level: 3,
      label: "Local authorities",
      detail: "LC1 and village safety leadership",
      tone: "blue",
    },
    { level: 4, label: "Emergency services", detail: "Fire brigade and ambulance", tone: "red" },
  ],
  attack: [
    {
      level: 1,
      label: "Trusted contacts",
      detail: "A trusted person you have saved",
      tone: "violet",
    },
    { level: 3, label: "Local authorities", detail: "Community policing contact", tone: "blue" },
    { level: 4, label: "Emergency services", detail: "Police emergency line", tone: "red" },
  ],
  accident: [
    {
      level: 1,
      label: "Trusted contacts",
      detail: "Family or friends you have saved",
      tone: "violet",
    },
    {
      level: 2,
      label: "Community responders",
      detail: "Nearby first aiders, if the scene is safe",
      tone: "amber",
    },
    { level: 4, label: "Emergency services", detail: "Ambulance and police", tone: "red" },
  ],
  missing: [
    {
      level: 1,
      label: "Trusted contacts",
      detail: "Family and friends you have saved",
      tone: "violet",
    },
    {
      level: 3,
      label: "Local authorities",
      detail: "Police and community leadership",
      tone: "blue",
    },
    { level: 4, label: "Emergency services", detail: "Police emergency line", tone: "red" },
  ],
  domestic: [
    { level: 1, label: "Trusted contacts", detail: "A safe person you have saved", tone: "violet" },
    { level: 3, label: "Local authorities", detail: "Community policing contact", tone: "blue" },
    { level: 4, label: "Emergency services", detail: "Police emergency line", tone: "red" },
  ],
  other: [
    {
      level: 1,
      label: "Trusted contacts",
      detail: "A family member or friend you choose",
      tone: "violet",
    },
    {
      level: 2,
      label: "Community responders",
      detail: "Nearby verified responders where appropriate",
      tone: "amber",
    },
    { level: 4, label: "Emergency services", detail: "The configured emergency line", tone: "red" },
  ],
};

const HELP_INFO: Record<
  string,
  { steps: string[]; primaryNumbers: (typeof EMERGENCY_NUMBERS)[number][]; showHospitals: boolean }
> = {
  crime: {
    steps: [
      "Move away from the suspect immediately — don't confront.",
      "Stay hidden if possible and keep phone on silent.",
      "Note appearance, direction, or vehicle when it is safe to do so.",
    ],
    primaryNumbers: [EMERGENCY_NUMBERS[0], EMERGENCY_NUMBERS[3]],
    showHospitals: false,
  },
  medical: {
    steps: [
      "Keep the patient still and calm — do not move them unless in danger.",
      "Check breathing. Start CPR if trained and they are unresponsive.",
      "Do not give food, water, or medication without dispatcher guidance.",
    ],
    primaryNumbers: [EMERGENCY_NUMBERS[1], EMERGENCY_NUMBERS[3]],
    showHospitals: true,
  },
  fire: {
    steps: [
      "Evacuate everyone immediately — do not fight the fire yourself.",
      "Stay low under smoke and use stairs only, never a lift.",
      "Once outside, move far away and do not re-enter for any reason.",
    ],
    primaryNumbers: [EMERGENCY_NUMBERS[2], EMERGENCY_NUMBERS[1]],
    showHospitals: true,
  },
  attack: {
    steps: [
      "Get to a safe, locked location and stay quiet.",
      "Keep phone on silent and stay on the line with police.",
      "Do not negotiate — wait for officers to arrive.",
    ],
    primaryNumbers: [EMERGENCY_NUMBERS[0], EMERGENCY_NUMBERS[3]],
    showHospitals: false,
  },
  accident: {
    steps: [
      "Turn on hazard lights; move vehicles off the road if safe.",
      "Do not move injured persons unless there is immediate danger.",
      "Secure the scene and keep bystanders clear until help arrives.",
    ],
    primaryNumbers: [EMERGENCY_NUMBERS[1], EMERGENCY_NUMBERS[0]],
    showHospitals: true,
  },
  missing: {
    steps: [
      "Check all usual locations before reporting.",
      "Gather a recent photo and clothing description.",
      "Report immediately — there is no minimum wait time.",
    ],
    primaryNumbers: [EMERGENCY_NUMBERS[0], EMERGENCY_NUMBERS[3]],
    showHospitals: false,
  },
  domestic: {
    steps: [
      "Leave the house and go to a neighbour or public place.",
      "Take children with you if at all possible.",
      "Do not try to reason with the aggressor.",
    ],
    primaryNumbers: [EMERGENCY_NUMBERS[0], EMERGENCY_NUMBERS[3]],
    showHospitals: false,
  },
  other: {
    steps: [
      "Stay calm and move to a safe location if needed.",
      "Call the appropriate number below.",
      "Stay on the line and follow dispatcher instructions.",
    ],
    primaryNumbers: [EMERGENCY_NUMBERS[3], EMERGENCY_NUMBERS[0], EMERGENCY_NUMBERS[1]],
    showHospitals: true,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildDirectionsUrl(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
) {
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=driving`;
}

function getLocation(): Promise<LocationInfo> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      const error = new Error("Location is not available on this device.");
      error.name = "unavailable";
      reject(error);
      return;
    }
    let best: GeolocationPosition | null = null;
    let settled = false;
    let watchId: number | null = null;
    const finish = async (position: GeolocationPosition) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      const { latitude: lat, longitude: lng, accuracy } = position.coords;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        );
        const d = await res.json();
        resolve({
          address: d.address?.road || d.display_name?.split(",")[0] || "Current Location",
          suburb: d.address?.suburb || d.address?.village || d.address?.neighbourhood || "",
          district: d.address?.city || d.address?.county || "",
          lat,
          lng,
          accuracy,
          capturedAt: Date.now(),
        });
      } catch {
        resolve({
          address: "Current Location",
          suburb: "",
          district: "",
          lat,
          lng,
          accuracy,
          capturedAt: Date.now(),
        });
      }
    };
    const timeout = window.setTimeout(() => {
      if (best) void finish(best);
      else {
        settled = true;
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        reject(new Error("location timeout"));
      }
    }, 15000);
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!best || position.coords.accuracy < best.coords.accuracy) best = position;
        // A phone GPS fix under 30m is usually good enough for an emergency pin.
        if (position.coords.accuracy <= 30) {
          window.clearTimeout(timeout);
          void finish(position);
        }
      },
      (err) => {
        window.clearTimeout(timeout);
        if (best) void finish(best);
        else {
          const error = new Error(
            err.code === 1
              ? "Location access is turned off."
              : "Allma couldn't determine your location.",
          );
          error.name = err.code === 1 ? "denied" : "unavailable";
          reject(error);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}

async function createResponderOffers(
  activityId: string,
  radiusMeters: number,
): Promise<ResponderOffer[]> {
  const client = supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
  };
  const { data: rawOffers, error } = await client.rpc("create_sos_responder_offers", {
    p_sos_activity_id: activityId,
    p_radius_meters: radiusMeters,
  });
  if (error) {
    console.warn("Responder offer creation unavailable", error);
    toast.error("SOS was activated, but responder notifications could not be sent.");
    return [];
  }
  const offers = (rawOffers as Omit<ResponderOffer, "phone">[] | null) ?? [];
  if (!offers.length) return [];

  const { data: rawContacts, error: contactError } = await client.rpc(
    "get_sos_responder_contacts",
    { p_sos_activity_id: activityId },
  );
  if (contactError) {
    console.warn("Responder phone lookup unavailable", contactError);
  }

  const contacts = (rawContacts as Array<{ offer_id: string; phone: string | null }> | null) ?? [];
  const phonesByOffer = new Map(contacts.map((contact) => [contact.offer_id, contact.phone]));

  return offers.map((offer) => ({
    ...offer,
    phone: phonesByOffer.get(offer.offer_id) ?? null,
  }));
}

function formatDistanceMeters(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function getAiMessages(type: string, location: LocationInfo | null): string[] {
  const loc = location ? location.district || location.suburb || "your area" : "your area";
  const typeMsg: Record<string, string> = {
    crime: `Stay out of sight if possible — do not confront anyone. Police call options are ready below for you to tap.`,
    medical: `Keep the patient still and calm. An ambulance call option is ready below, and nearby hospitals are listed.`,
    fire: `Evacuate immediately — stay low and use stairs, never lifts. Fire service and ambulance call options are ready below.`,
    attack: `Move to a locked, safe location if you can. Stay quiet and keep your phone on silent while you call police.`,
    accident: `Do not move injured persons unless there is immediate danger. Ambulance and police call options are ready below.`,
    missing: `Report immediately — there is no minimum wait time. Police call options and the consented search path are ready.`,
    domestic: `If safe to do so, leave the premises and move to a neighbour or public place. Police call options are ready below.`,
    other: `Stay calm and remain in a safe location if possible. Choose the appropriate call option below.`,
  };
  return [
    `Emergency mode is active. I'm going to help you step by step.`,
    location
      ? `Your location has been found in ${loc}. You decide which contacts receive it.`
      : `I couldn't use GPS. You can still call for help or share a nearby landmark.`,
    typeMsg[type] ?? typeMsg.other,
    `The response path is ready. No authority or responder has been contacted automatically.`,
  ];
}

// ─── useAiChat ────────────────────────────────────────────────────────────────

function useAiChat(messages: string[]) {
  const msgs = useRef(messages);
  const [log, setLog] = useState<string[]>([]);
  const [typing, setTyping] = useState("");
  const msgIdx = useRef(0);
  const charIdx = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function tick() {
      const msg = msgs.current[msgIdx.current];
      if (!msg) return;
      if (charIdx.current < msg.length) {
        setTyping(msg.slice(0, charIdx.current + 1));
        charIdx.current++;
        timer = setTimeout(tick, 13 + Math.random() * 10);
      } else {
        setLog((prev) => [...prev, msg]);
        setTyping("");
        msgIdx.current++;
        charIdx.current = 0;
        if (msgIdx.current < msgs.current.length) timer = setTimeout(tick, 2200);
      }
    }
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, []);

  return { log, typing };
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
      {children}
    </p>
  );
}

function AiChatBubble({ text, typing }: { text: string; typing?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="sos-glow-sm mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-destructive to-primary-glow">
        <Brain className="h-3.5 w-3.5 text-destructive-foreground" />
      </div>
      <div className="premium-surface flex-1 rounded-2xl rounded-tl-sm border border-border/60 px-4 py-3 text-[13px] leading-relaxed text-foreground">
        {text}
        {typing && (
          <span className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 animate-pulse rounded-full bg-secondary/60" />
        )}
      </div>
    </div>
  );
}

function EmergencyTriage({
  emergencyType,
  onAssessment,
}: {
  emergencyType: string;
  onAssessment: (assessment: {
    category: string;
    severity: Severity;
    immediateDanger: "yes" | "no" | "unknown";
  }) => void;
}) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<string[]>([
    "Emergency mode is active. I'm going to help you step by step.",
  ]);
  const [severity, setSeverity] = useState<Severity>("UNKNOWN");
  const [immediateDanger, setImmediateDanger] = useState<"yes" | "no" | "unknown">("unknown");
  const [silentMode, setSilentMode] = useState(false);

  const questionSet = [
    "First, tell me what is happening.",
    "Are you in immediate danger right now?",
    emergencyType === "medical"
      ? "Is the person conscious and breathing normally?"
      : emergencyType === "fire"
        ? "Are people trapped or unable to leave safely?"
        : emergencyType === "missing"
          ? "Who is missing, and when were they last seen?"
          : "Can you move somewhere safer without putting yourself at greater risk?",
  ];
  const currentQuestion = questionSet[Math.min(questionIndex, questionSet.length - 1)];

  const classify = (answer: string, nextIndex: number) => {
    const normalized = answer.toLowerCase();
    const category =
      normalized.includes("fire") || normalized.includes("smoke")
        ? "fire"
        : normalized.includes("accident") || normalized.includes("crash")
          ? "accident"
          : normalized.includes("attack") ||
              normalized.includes("violence") ||
              normalized.includes("robbery")
            ? "attack"
            : emergencyType;
    const danger =
      nextIndex === 1
        ? normalized.includes("yes") || normalized.includes("can't") || normalized.includes("cannot")
          ? normalized.includes("yes")
            ? "yes"
            : "unknown"
          : "no"
        : immediateDanger;
    const nextSeverity: Severity =
      danger === "yes"
        ? "CRITICAL"
        : category === "missing" || category === "attack" || category === "fire"
          ? "HIGH"
          : nextIndex >= 2
            ? "MEDIUM"
            : "UNKNOWN";
    setSeverity(nextSeverity);
    setImmediateDanger(danger);
    onAssessment({ category, severity: nextSeverity, immediateDanger: danger });
  };

  const submit = (value: string) => {
    const answer = value.trim();
    if (!answer) return;
    const nextIndex = Math.min(questionIndex + 1, questionSet.length - 1);
    setMessages((current) => [...current, `You: ${answer}`]);
    classify(answer, questionIndex);
    setTimeout(() => {
      setMessages((current) => [
        ...current,
        questionIndex === 0
          ? "I understand. I’m checking immediate danger first."
          : questionIndex === 1 && answer.toLowerCase().startsWith("yes")
            ? "Stay with me. If it is safe, move away from the danger. Do not confront anyone."
            : "Thank you. I’m keeping the emergency record updated.",
      ]);
    }, 180);
    setQuestionIndex(nextIndex);
    setDraft("");
  };

  const voice = useVoiceInput({
    onTranscript: (text) => submit(text),
    onError: (message) => setMessages((current) => [...current, message]),
  });

  return (
    <div className="rounded-2xl border border-destructive/25 bg-destructive/10 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-destructive/18">
            <Brain className="h-4 w-4 text-destructive" />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-destructive">
              One question at a time
            </p>
            <p className="text-[11px] text-muted-foreground">Allma emergency triage</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-success">
          <span className="online-pulse h-1.5 w-1.5 rounded-full bg-success" /> Listening
        </span>
      </div>

      <div className="space-y-2">
        {messages.slice(-3).map((message, index) => (
          <div
            key={`${message}-${index}`}
            className={cn(
              "rounded-xl px-3 py-2 text-[12px] leading-relaxed",
              message.startsWith("You:")
                ? "ml-8 bg-secondary/60 text-muted-foreground"
                : "border border-border/50 bg-card/50 text-foreground",
            )}
          >
            {message}
          </div>
        ))}
        <div className="rounded-xl border border-border/50 bg-card/65 px-3 py-2.5 text-[13px] font-semibold leading-relaxed text-foreground">
          {currentQuestion}
        </div>
      </div>

      {questionIndex === 1 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {["Yes", "No", "I'm not sure", "I can't speak"].map((answer) => (
            <button
              key={answer}
              type="button"
              onClick={() => {
                if (answer === "I can't speak") setSilentMode(true);
                submit(answer);
              }}
              className="min-h-10 rounded-xl border border-border/60 bg-secondary/60 px-2 py-2 text-[11px] font-bold text-foreground transition hover:border-destructive/40 hover:bg-destructive/10"
            >
              {answer}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(draft);
            }
          }}
          rows={1}
          placeholder={silentMode ? "Use a short answer or a button…" : "Type what you need Allma to know…"}
          aria-label="Emergency response"
          className="min-h-11 flex-1 resize-none rounded-xl border border-border/60 bg-background/70 px-3 py-2.5 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground focus:border-destructive/50"
        />
        <button
          type="button"
          onClick={() => void voice.toggle()}
          aria-label={voice.recording ? "Stop listening" : "Speak to Allma"}
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition",
            voice.recording
              ? "border-destructive/40 bg-destructive text-destructive-foreground"
              : "border-border/60 bg-secondary/60 text-foreground hover:border-destructive/40",
          )}
        >
          {voice.transcribing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => submit(draft)}
          aria-label="Send emergency response"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-destructive text-destructive-foreground transition hover:bg-destructive/90"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{voice.recording ? "🎙 Listening…" : "Voice or text · your choice"}</span>
        <span className="font-semibold">
          {severity !== "UNKNOWN" ? `${severity} priority` : "Assessment in progress"}
        </span>
      </div>
    </div>
  );
}

const RESPONDER_STATUS_CHIP: Record<ResponderStatus, { label: string; cls: string }> = {
  offered: { label: "Offered", cls: "bg-secondary/60 text-muted-foreground" },
  accepted: { label: "Accepted", cls: "bg-gold/18 text-gold" },
  declined: { label: "Declined", cls: "bg-destructive/18 text-destructive" },
  en_route: { label: "En Route", cls: "bg-info/18 text-info" },
  arrived: { label: "Arrived", cls: "bg-success/18 text-success" },
  cancelled: { label: "Cancelled", cls: "bg-secondary/60 text-muted-foreground" },
};

function ResponderCard({ responder }: { responder: Responder }) {
  const chip = RESPONDER_STATUS_CHIP[responder.status];
  return (
    <motion.div
      layout
      className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/40 px-4 py-3 backdrop-blur-sm"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 22 }}
    >
      <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-secondary to-secondary/40 text-sm font-bold text-foreground">
        <Phone className="h-4 w-4" />
        {responder.verified && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-info text-[9px] font-black text-info-foreground">
            ✓
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13px] font-semibold text-foreground">
            {responder.phone ?? "Phone unavailable"}
          </p>
          {responder.verified && (
            <span className="rounded-full border border-info/30 bg-info/18 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-info">
              Verified phone
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {responder.phone ? `${responder.name} · ` : ""}
          Approx. {responder.distance} away · {responder.eta}
        </p>
      </div>
      {responder.phone && (
        <a
          href={`tel:${responder.phone.replace(/[^\d+]/g, "")}`}
          aria-label={`Call responder at ${responder.phone}`}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-gold/18 px-2.5 py-1.5 text-[10px] font-bold text-gold transition hover:bg-gold/25"
        >
          <Phone className="h-3 w-3" /> Call
        </a>
      )}
      <AnimatePresence mode="wait">
        <motion.span
          key={responder.status}
          className={cn("shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold", chip.cls)}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={{ duration: 0.18 }}
        >
          {chip.label}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}

function FacilityRow({ facility }: { facility: Facility }) {
  const isHospital = facility.type === "hospital";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/40 px-3.5 py-3 backdrop-blur-sm">
      <div
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full",
          isHospital ? "bg-success/18" : "bg-info/18",
        )}
      >
        {isHospital ? (
          <Building2 className="h-4 w-4 text-success" />
        ) : (
          <Shield className="h-4 w-4 text-info" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">{facility.name}</p>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{facility.address}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span
          className={cn(
            "text-[11px] font-semibold",
            isHospital ? "text-success" : "text-info",
          )}
        >
          {facility.distance}
        </span>
        {facility.phone ? (
          <a
            href={`tel:${facility.phone.replace(/\s/g, "")}`}
            className="flex min-h-8 items-center gap-1 rounded-lg border border-border/70 bg-secondary px-2.5 py-1 text-[10px] font-bold text-foreground transition hover:border-primary/40 hover:bg-accent"
          >
            <Phone className="h-2.5 w-2.5" /> Call
          </a>
        ) : (
          <span className="rounded-lg border border-border/60 bg-secondary/50 px-2.5 py-1 text-[9px] font-semibold text-muted-foreground">
            No phone
          </span>
        )}
      </div>
    </div>
  );
}

function FacilitySection({ title, facilities }: { title: string; facilities: Facility[] }) {
  if (!facilities.length) return null;
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      <div className="space-y-2">
        {facilities.map((f, i) => (
          <FacilityRow key={`${f.name}-${f.address}-${i}`} facility={f} />
        ))}
      </div>
    </div>
  );
}

// ─── Live location map lives in ./live-location-map (shared with the call screen) ──


function StatusTile({
  icon: Icon,
  label,
  value,
  color,
  visible,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: "green" | "blue" | "amber" | "red";
  visible: boolean;
}) {
  const cls = {
    green: "border-success/20 bg-success/18 text-success",
    blue: "border-info/20 bg-info/18 text-info",
    amber: "border-gold/20 bg-gold/18 text-gold",
    red: "border-destructive/20 bg-destructive/18 text-destructive",
  }[color];
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={cn("flex flex-col gap-1.5 rounded-xl border p-3.5", cls)}
          initial={{ opacity: 0, scale: 0.88, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
        >
          <Icon className="h-4 w-4 opacity-70" />
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-55">
            {label}
          </span>
          <span className="text-[11px] font-semibold leading-tight">{value}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function SOSExperience({
  instant,
  smartCheckId,
}: { instant?: boolean; smartCheckId?: string } = {}) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>(instant ? "loading" : "idle");

  const [emergencyType, setEmergencyType] = useState("other");
  const [pendingEmergencyType, setPendingEmergencyType] = useState("other");
  const [shareLocation, setShareLocation] = useState(true);
  const [notifyResponders, setNotifyResponders] = useState(true);
  const [location, setLocation] = useState<LocationInfo | null>(null);
  const [locationState, setLocationState] = useState<LocationState>("finding");
  const [emergencyId, setEmergencyId] = useState<string | null>(null);
  const [activatedAt, setActivatedAt] = useState<number | null>(null);
  const [hospitals, setHospitals] = useState<Facility[]>([]);
  const [officers, setOfficers] = useState<Facility[]>([]);
  const [trustedContacts, setTrustedContacts] = useState<TrustedContact[]>([]);
  const [responderOffers, setResponderOffers] = useState<ResponderOffer[]>([]);
  const [sosActivityId, setSosActivityId] = useState<string | null>(null);
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | undefined>();
  const [reportText, setReportText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const activated = useRef(false);
  // Guards the single emergency-session insert: without it, the auth-hydration
  // backfill below could race the activation path and create two sessions.
  const activityRecording = useRef(false);
  // Throttles live-location writes and remembers the last saved fix.
  const locationSync = useRef<{ at: number; lat: number; lng: number; failed: boolean }>({
    at: 0,
    lat: 0,
    lng: 0,
    failed: false,
  });

  // Persist the position onto the emergency session so the people being called
  // (and responders) actually receive it. Runs whenever the session id or the
  // GPS fix changes, so it no longer matters which arrives first.
  useEffect(() => {
    if (!user || !sosActivityId || !location || !shareLocation) return;
    const now = Date.now();
    const last = locationSync.current;
    const moved =
      Math.abs(last.lat - location.lat) > 0.00025 || Math.abs(last.lng - location.lng) > 0.00025;
    const isFirst = last.at === 0;
    if (!isFirst && !moved && now - last.at < 10_000) return;
    locationSync.current = { ...last, at: now, lat: location.lat, lng: location.lng };

    void (async () => {
      const { error } = await supabase
        .from("safety_activity")
        .update({
          location_text: `${location.address}, ${location.district}`.replace(/(^, )|(, $)/g, ""),
          latitude: location.lat,
          longitude: location.lng,
          details: {
            channel: "sos",
            emergency_type: emergencyType,
            accuracy_m: location.accuracy,
            location_consent: true,
            responder_notification_consent: notifyResponders,
            coordination_mode: "consent_based",
            activation_mode: smartCheckId ? "smart_detection" : "manual",
            location_updated_at: new Date().toISOString(),
            ...(smartCheckId ? { smart_sos_check_id: smartCheckId } : {}),
          } as never,
        })
        .eq("id", sosActivityId);
      if (error) {
        console.error("Failed to share SOS location", error);
        if (!locationSync.current.failed) {
          locationSync.current = { ...locationSync.current, failed: true };
          toast.error("SOS is active, but your location could not be shared.");
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sosActivityId, shareLocation, location?.lat, location?.lng, location?.accuracy]);

  useEffect(() => {
    if (phase !== "help" || !location || !("geolocation" in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude: lat, longitude: lng, accuracy } = position.coords;
        setLocation((current) =>
          current
            ? {
                ...current,
                lat,
                lng,
                accuracy,
                capturedAt: Date.now(),
              }
            : current,
        );
      },
      (error) => console.warn("Live GPS update unavailable", error),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [phase, Boolean(location)]);

  // Wait for the session before auto-activating: activating first meant the
  // emergency session row was never written, so the dialer had no session id
  // and never placed a call.
  useEffect(() => {
    if (!instant || authLoading || activated.current) return;
    void activateEmergency();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instant, authLoading]);

  // Safety net: if SOS was activated before the session hydrated, record the
  // emergency as soon as the user is known so responder calling can start.
  useEffect(() => {
    if (!user || !activated.current || sosActivityId || activityRecording.current) return;
    void (async () => {
      const id = await recordSosActivity(user.id, emergencyType);
      if (id) setSosActivityId(id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sosActivityId, emergencyType]);

  function handleSosPress() {
    setPendingEmergencyType("other");
    setShareLocation(true);
    setNotifyResponders(true);
    void activateEmergency();
  }

  function handleTypeSelect(type: string) {
    setPendingEmergencyType(type);
    setShareLocation(true);
    setNotifyResponders(true);
    setPhase("consent");
  }

  async function recordSosActivity(userId: string, type: string) {
    if (activityRecording.current) return null;
    activityRecording.current = true;
    const { data: activity, error } = await supabase
      .from("safety_activity")
      .insert({
        user_id: userId,
        activity_type: "sos_activated",
        title: "Emergency SOS activated",
        summary: `SOS activated for ${EMERGENCY_TYPES.find((item) => item.id === type)?.label ?? "an emergency"}.`,
        severity: "critical",
        location_text: "Location pending",
        details: {
          channel: "sos",
          emergency_type: type,
          location_consent: shareLocation,
          responder_notification_consent: notifyResponders,
          coordination_mode: "consent_based",
          activation_mode: smartCheckId ? "smart_detection" : "manual",
          ...(smartCheckId ? { smart_sos_check_id: smartCheckId } : {}),
        } as never,
      })
      .select("id")
      .single();
    if (error) {
      console.error("Failed to record SOS activity", error);
      activityRecording.current = false;
      return null;
    }
    const activityId = activity?.id ?? null;
    if (activityId && smartCheckId) {
      void logCheckEvent(smartCheckId, "sos_activated", { sos_activity_id: activityId });
    }
    return activityId;
  }

  async function activateEmergency() {
    const type = pendingEmergencyType;
    if (activated.current) return;
    activated.current = true;
    try {
      setMicrophoneStream(await primeMicrophone());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Microphone access is required for SOS calls.");
    }
    setEmergencyId(createEmergencyId());
    setActivatedAt(Date.now());
    setSosActivityId(null);
    setResponderOffers([]);
    setEmergencyType(type);
    setPhase("loading");
    setLocationState(shareLocation ? "finding" : "skipped");

    let activityId: string | null = null;
    if (user) {
      activityId = await recordSosActivity(user.id, type);
      setSosActivityId(activityId);
    }

    // Make the emergency screen and responder calling available as soon as the
    // SOS record exists. GPS and nearby-resource lookups continue below.
    setPhase("help");
    if (activityId && notifyResponders) {
      void notifySosActivity({ data: { activityId } }).catch((error) => {
        console.error("[ALLMA PUSH] SOS activity notification failed", error);
      });
    }


    let loc: LocationInfo | null = null;
    try {
      loc = await getLocation();
      setLocationState(loc.accuracy <= 30 ? "found" : "approximate");
    } catch (error) {
      loc = null;
      setLocationState(
        error instanceof Error && error.name === "denied" ? "denied" : "unavailable",
      );
    }
    setLocation(shareLocation ? loc : null);

    // The location is persisted to the emergency session by the effect above,
    // which runs whichever of the session row / GPS fix lands last and keeps
    // writing live updates for the people being called.


    if (user) {
      void supabase
        .from("emergency_contacts")
        .select("id, name, phone, relationship")
        .order("created_at", { ascending: true })
        .then(({ data, error }) => {
          if (!error) setTrustedContacts((data ?? []) as TrustedContact[]);
        });
    }

    const offersPromise = activityId && notifyResponders
      ? createResponderOffers(activityId, COMMUNITY_RADIUS[type] ?? 1000)
      : Promise.resolve([] as ResponderOffer[]);

    if (loc && shareLocation) {
      const [nearby, offers] = await Promise.all([
        loadNearbyFacilities(loc.lat, loc.lng),
        offersPromise,
      ]);
      setHospitals(nearby.hospitals.slice(0, 4));
      setOfficers(nearby.police.slice(0, 3));
      setResponderOffers(offers);
    } else {
      const offers = await offersPromise;
      setHospitals([]);
      setOfficers([]);
      setResponderOffers(offers);
    }
    // Nearby resources and responder offers update the already active SOS view.
  }

  async function handleSubmitReport() {
    setSubmitting(true);
    let ref = `ASA-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900000 + 100000))}`;
    if (user && location) {
      const { data, error } = await supabase
        .from("reports")
        .insert({
          user_id: user.id,
          report_type: "emergency",
          category: "sos",
          title: "Emergency SOS",
          summary: reportText || "Emergency SOS submitted.",
          narrative: reportText,
          risk_level: "critical",
          priority: "critical",
          latitude: location.lat,
          longitude: location.lng,
          location_text: `${location.address}, ${location.district}`,
        })
        .select("reference")
        .single();
      if (error) {
        console.error("Failed to save SOS report", error);
      } else if (data?.reference) {
        ref = data.reference;
      }
    }
    setReference(ref);
    setSubmitting(false);
    setPhase("submitted");
  }

  return (
    <div className="signal-slate fixed inset-0 z-[100] flex h-[100dvh] w-screen max-w-full flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* Ambient brand glow — same signal-streak wash as the onboarding wizard */}
      <div className="signal-streak pointer-events-none absolute inset-0" />
      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(color-mix(in oklab, var(--border) 90%, transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in oklab, var(--border) 90%, transparent) 1px,transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <AnimatePresence mode="wait">
        {phase === "idle" && (
          <IdleScreen
            key="idle"
            onActivate={handleSosPress}
            onExit={() => navigate({ to: "/chat", replace: true })}
          />
        )}
        {phase === "type-select" && (
          <TypeSelectScreen key="type-select" onSelect={handleTypeSelect} />
        )}
        {phase === "consent" && (
          <ConsentScreen
            key="consent"
            emergencyType={pendingEmergencyType}
            shareLocation={shareLocation}
            notifyResponders={notifyResponders}
            setShareLocation={setShareLocation}
            setNotifyResponders={setNotifyResponders}
            onConfirm={activateEmergency}
            onBack={() => setPhase("type-select")}
          />
        )}
        {phase === "loading" && (
          <LoadingScreen key="loading" emergencyId={emergencyId} />
        )}
        {smartCheckId && phase !== "idle" && (
          <div className="relative z-20 mx-auto mt-3 w-full max-w-2xl px-4">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/[0.08] px-4 py-3">
              <Brain className="h-4 w-4 shrink-0 text-destructive" />
              <p className="min-w-0 flex-1 text-[12px] font-semibold leading-relaxed">
                Activated automatically after a safety check you didn’t respond to.
              </p>
              <button
                type="button"
                onClick={async () => {
                  await resolveSafetyCheck(smartCheckId, "cancelled", { source: "sos_screen" });
                  void navigate({ to: "/dashboard" });
                }}
                className="rounded-xl border border-border/70 bg-background/70 px-3 py-1.5 text-[11.5px] font-bold transition hover:bg-accent"
              >
                I’m safe — cancel
              </button>
            </div>
          </div>
        )}

        {phase === "help" && (
          <MinimalEmergencyScreen
            key="help"
            emergencyType={emergencyType}
            emergencyId={emergencyId}
            location={location}
            locationState={locationState}
            activityId={sosActivityId}
            microphoneStream={microphoneStream}
            onReport={() => setPhase("report")}
            onEnableLocation={async () => {
              setLocationState("finding");
              try {
                const nextLocation = await getLocation();
                setLocation(nextLocation);
                setShareLocation(true);
                setLocationState(nextLocation.accuracy <= 30 ? "found" : "approximate");
                if (sosActivityId) {
                  const { error } = await supabase
                    .from("safety_activity")
                    .update({
                      location_text: `${nextLocation.address}, ${nextLocation.district}`.replace(/, $/, ""),
                      latitude: nextLocation.lat,
                      longitude: nextLocation.lng,
                    })
                    .eq("id", sosActivityId);
                  if (error) toast.error("Location could not be saved. Please try again.");
                }
              } catch (error) {
                setLocationState(
                  error instanceof Error && error.name === "denied" ? "denied" : "unavailable",
                );
              }
            }}
            onClose={() => {
              activated.current = false;
              setSosActivityId(null);
              setResponderOffers([]);
              setEmergencyId(null);
               setActivatedAt(null);
              setLocation(null);
              setLocationState("finding");
              setPhase("idle");
            }}
          />
        )}
        {phase === "report" && (
          <ReportScreen
            key="report"
            reportText={reportText}
            setReportText={setReportText}
            onSubmit={handleSubmitReport}
            onBack={() => setPhase("help")}
            submitting={submitting}
            emergencyType={emergencyType}
            emergencyId={emergencyId}
            activatedAt={activatedAt}
            locationState={locationState}
            respondersNotified={notifyResponders}
            responderCount={responderOffers.length}
          />
        )}

        {phase === "submitted" && (
          <SubmittedScreen
            key="submitted"
            reference={reference}
            onDone={() => {
              activated.current = false;
              setSosActivityId(null);
              setResponderOffers([]);
              setEmergencyId(null);
               setActivatedAt(null);
              setLocation(null);
              setLocationState("finding");
              setPhase("idle");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Idle ─────────────────────────────────────────────────────────────────────

function IdleScreen({ onActivate, onExit }: { onActivate: () => void; onExit: () => void }) {
  return (
    <motion.div
      className="signal-screen signal-idle flex min-h-0 flex-1 flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.3 }}
    >
       {/* Top bar */}
       <div className="flex items-center justify-between border-b border-border/60 bg-background/45 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-full bg-destructive/18">
            <Siren className="h-3.5 w-3.5 text-destructive" strokeWidth={1.5} />
          </div>
          <span className="truncate text-[13px] font-semibold text-foreground">Allma Safety AI</span>
        </div>
         <div className="flex items-center gap-2">
           <button
             type="button"
             onClick={onExit}
             aria-label="Exit SOS and return to Allma AI"
             className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border/70 bg-secondary/70 px-3 py-1.5 text-[11px] font-bold text-foreground transition hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
           >
             <ArrowLeft className="h-3.5 w-3.5" /> Allma AI
           </button>
         </div>
      </div>

      {/* Main area — side by side on desktop */}
       <div className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 items-center gap-5 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)] lg:gap-8 lg:overflow-hidden lg:px-10 lg:py-8 xl:gap-12">
        {/* Left: button */}
         <div className="flex flex-col items-center rounded-[2rem] border border-destructive/15 bg-background/25 px-4 py-7 text-center shadow-soft backdrop-blur-sm sm:px-8 sm:py-9 lg:-translate-y-1 lg:px-10 lg:py-10">
          <motion.p
            className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.28em] text-destructive/60"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Emergency Response
          </motion.p>
          <motion.h1
            className="mb-2 font-display text-[32px] font-black text-foreground"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
          >
            SOS
          </motion.h1>
          <motion.p
             className="mb-7 text-[13px] text-muted-foreground sm:mb-9"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            Get emergency help
          </motion.p>

          {/* The button */}
          <motion.div
            className="relative"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.22, type: "spring", stiffness: 240, damping: 18 }}
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-destructive/15" />
            <span className="absolute -inset-6 animate-ping rounded-full bg-destructive/7 [animation-delay:0.6s]" />
            <button
              onClick={onActivate}
              aria-label="Activate Emergency SOS"
             className="relative h-[min(13rem,58vw)] w-[min(13rem,58vw)] rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background sm:h-52 sm:w-52 lg:h-56 lg:w-56"
            >
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "conic-gradient(from 0deg, var(--destructive), var(--gold) 38%, var(--destructive) 68%, var(--primary-glow))",
                  padding: "3px",
                }}
              />
              <span className="absolute inset-[3px] rounded-full bg-background" />
              <span className="sos-glow absolute inset-[14px] flex items-center justify-center rounded-full bg-gradient-to-br from-destructive to-primary-glow">
                <span className="font-display text-[28px] font-black tracking-[0.18em] text-destructive-foreground">
                  SOS
                </span>
              </span>
            </button>
          </motion.div>

           <motion.p
            className="mt-6 flex items-center gap-1.5 text-[11px] text-muted-foreground sm:mt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
             <span className="h-1.5 w-1.5 rounded-full bg-gold" />
             Tap once to activate your emergency response
          </motion.p>
        </div>

        {/* Right: info panel — stacked below the button on mobile */}
        <motion.div
           className="w-full space-y-3 rounded-[2rem] border border-border/60 bg-secondary/25 p-4 shadow-soft backdrop-blur-sm sm:p-5 lg:p-6"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
           <div className="mb-4 flex items-end justify-between gap-3">
             <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
               Official emergency lines
             </p>
             <span className="text-[10px] text-muted-foreground">Tap to call</span>
           </div>
          {EMERGENCY_NUMBERS.map((e) => (
            <a
              key={e.label}
              href={`tel:${e.number}`}
              className="flex items-center justify-between rounded-2xl border border-border/60 bg-secondary/40 px-4 py-3 transition hover:bg-accent"
            >
              <div>
                <p className="text-[13px] font-semibold text-foreground">{e.label}</p>
                <p className="text-[11px] text-muted-foreground">Tap to call</p>
              </div>
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-xl bg-gradient-to-br px-3 py-1.5 text-[15px] font-black",
                  e.gradient,
                )}
                style={{ boxShadow: `0 0 18px -4px color-mix(in oklab, ${e.glow} 55%, transparent)` }}
              >
                <Phone className="h-3 w-3" />
                {e.number}
              </div>
            </a>
          ))}
          <div className="rounded-2xl border border-border/60 bg-secondary/40 px-4 py-3 text-[12px] text-muted-foreground leading-relaxed">
            Allma AI guides you through an emergency, helps locate nearby services, and keeps you in
            control of every contact.
       </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─── Type Select ─────────────────────────────────────────────────────────────

function TypeSelectScreen({ onSelect }: { onSelect: (t: string) => void }) {
  return (
    <motion.div
      className="signal-screen signal-type-select flex min-h-0 flex-1 flex-col overflow-y-auto"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25 }}
    >
      <div className="mx-auto w-full max-w-2xl px-4 pt-8 pb-10 sm:px-5 sm:pt-12">
        <motion.div
          className="mb-7"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
        >
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.26em] text-destructive/60">
            Emergency SOS
          </p>
          <h2 className="font-display text-2xl font-black text-foreground">What's happening?</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Select the emergency type. Help will be tailored instantly.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {EMERGENCY_TYPES.map((et, i) => {
            const Icon = et.icon;
            return (
              <motion.button
                key={et.id}
                onClick={() => onSelect(et.id)}
                className="group flex min-w-0 flex-col items-center gap-2.5 rounded-2xl border border-border/60 bg-secondary/40 p-3.5 text-center backdrop-blur-md transition-all hover:border-border/60 hover:bg-accent active:scale-95 sm:gap-3 sm:p-5"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.07 + i * 0.03 }}
                whileTap={{ scale: 0.93 }}
              >
                <div className={cn("grid h-11 w-11 place-items-center rounded-2xl", et.bg)}>
                  <Icon className={cn("h-5 w-5", et.color)} strokeWidth={1.5} />
                </div>
                  <span className="text-[12px] font-semibold leading-tight text-foreground group-hover:text-foreground sm:text-[13px]">
                  {et.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Consent ───────────────────────────────────────────────────────────────────

function ConsentScreen({
  emergencyType,
  shareLocation,
  notifyResponders,
  setShareLocation,
  setNotifyResponders,
  onConfirm,
  onBack,
}: {
  emergencyType: string;
  shareLocation: boolean;
  notifyResponders: boolean;
  setShareLocation: (value: boolean) => void;
  setNotifyResponders: (value: boolean) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const typeInfo = EMERGENCY_TYPES.find((type) => type.id === emergencyType);
  const Icon = typeInfo?.icon ?? AlertTriangle;
  const plan = RESPONSE_PLANS[emergencyType] ?? RESPONSE_PLANS.other;

  return (
    <motion.div
      className="signal-screen signal-consent flex min-h-0 flex-1 flex-col overflow-y-auto"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -18 }}
      transition={{ duration: 0.25 }}
    >
      <div className="mx-auto w-full max-w-xl px-4 py-7 sm:px-5 sm:py-10">
        <button
          onClick={onBack}
              className="mb-6 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border/70 bg-secondary/70 px-3.5 text-[13px] font-semibold text-foreground transition hover:border-primary/40 hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Change emergency type
        </button>
        <div className="mb-6 flex items-start gap-3">
          <div
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
              typeInfo?.bg ?? "bg-destructive/18",
            )}
          >
            <Icon className={cn("h-5 w-5", typeInfo?.color ?? "text-destructive")} />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-destructive/65">
              Before we coordinate help
            </p>
            <h2 className="mt-1 font-display text-2xl font-black text-foreground">
              {typeInfo?.label ?? "Emergency"}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              You stay in control of what Allma shares. Calls to official services always require
              your tap.
            </p>
          </div>
        </div>

        <div className="mb-5 rounded-2xl border border-border/60 bg-secondary/40 p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Suggested response path
          </p>
          <div className="space-y-3">
            {plan.map((target) => (
              <div key={target.level} className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-black",
                    target.tone === "red"
                      ? "bg-destructive/18 text-destructive"
                      : target.tone === "blue"
                        ? "bg-info/18 text-info"
                        : target.tone === "amber"
                          ? "bg-gold/18 text-gold"
                          : "bg-trusted/18 text-trusted",
                  )}
                >
                  {target.level}
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-foreground">{target.label}</p>
                  <p className="text-[11px] text-muted-foreground">{target.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <ConsentOption
            checked={shareLocation}
            onChange={() => setShareLocation(!shareLocation)}
            title="Share my location for this emergency"
            description="Allma uses your current GPS location to guide you and coordinate the right response."
            icon={MapPin}
          />
          <ConsentOption
            checked={notifyResponders}
            onChange={() => setNotifyResponders(!notifyResponders)}
            title="Alert opted-in community responders"
            description="Only nearby verified responders are notified. They receive an approximate area, not your exact identity or coordinates."
            icon={Users}
          />
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-gold/20 bg-gold/10 px-4 py-3 text-[11px] leading-relaxed text-gold">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
          <span>
            For immediate danger, call the official emergency number shown on the next screen. Allma
            is independent and is not an emergency service.
          </span>
        </div>

        <button
          onClick={onConfirm}
          className="shadow-lift mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-destructive py-4 font-display text-[15px] font-bold text-destructive-foreground transition hover:bg-destructive/90 active:scale-[0.99]"
        >
          <ShieldAlert className="h-4 w-4" /> Activate coordinated SOS
        </button>
      </div>
    </motion.div>
  );
}

function ConsentOption({
  checked,
  onChange,
  title,
  description,
  icon: Icon,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition",
        checked ? "border-success/25 bg-success/18" : "border-border/60 bg-secondary/40",
      )}
      aria-pressed={checked}
    >
      <div
        className={cn(
          "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl",
          checked ? "bg-success/18 text-success" : "bg-secondary/60 text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-foreground">{title}</span>
        <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <span
        className={cn(
          "mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border",
          checked
            ? "border-success bg-success text-success-foreground"
            : "border-border/60 text-transparent",
        )}
      >
        <Check className="h-3 w-3" />
      </span>
    </button>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────

function LoadingScreen({ emergencyId }: { emergencyId: string | null }) {
  const steps = [
    "Activating emergency mode…",
    "Detecting precise GPS location…",
    "Preparing the right response path…",
    "Searching for opted-in responders…",
  ];
  const [step, setStep] = useState(0);
  const [aiText, setAiText] = useState("");
  const aiFull =
    "Emergency mode is active. I'm going to help you step by step.";

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 900);
    const t2 = setTimeout(() => setStep(2), 2200);
    const t3 = setTimeout(() => setStep(3), 3400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setAiText(aiFull.slice(0, i));
      if (i >= aiFull.length) clearInterval(timer);
    }, 20);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div
      className="signal-screen signal-loading flex h-full flex-col items-center justify-center px-8 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-7 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-destructive">
          Emergency mode
        </p>
        <h1 className="mt-2 font-display text-2xl font-black text-foreground">
          Allma is here with you
        </h1>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {emergencyId ? `Session ${emergencyId}` : "Starting your emergency session"}
        </p>
      </div>

      <div className="relative mb-9 flex items-center justify-center">
        <span className="absolute h-52 w-52 animate-ping rounded-full bg-destructive/7 [animation-duration:1.6s]" />
        <span className="absolute h-36 w-36 animate-ping rounded-full bg-destructive/11 [animation-duration:1.2s]" />
        <motion.div
          className="relative flex h-24 w-24 items-center justify-center rounded-full border border-destructive/40 bg-destructive/18 backdrop-blur-sm"
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 1.1, repeat: Infinity }}
        >
          <Siren className="h-11 w-11 text-destructive" strokeWidth={1.5} />
        </motion.div>
      </div>

      <motion.div
        className="mb-8 flex max-w-sm items-start gap-2.5 text-left"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-destructive to-destructive">
          <Brain className="h-3.5 w-3.5 text-foreground" />
        </div>
        <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-secondary/40 px-4 py-3 text-[13px] leading-relaxed text-foreground">
          {aiText}
          {aiText.length < aiFull.length && (
            <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-secondary/60" />
          )}
        </div>
      </motion.div>

      <div className="w-full max-w-xs space-y-3">
        {steps.map((s, i) => (
          <motion.div
            key={i}
            className={cn(
              "flex items-center gap-3 text-[13px] transition-colors",
              i <= step ? "text-foreground" : "text-muted-foreground",
            )}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            {i < step ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            ) : i === step ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gold" />
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-full border border-border/60" />
            )}
            {s}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function MinimalEmergencyScreen({
  emergencyType,
  emergencyId,
  location,
  locationState,
  activityId,
  microphoneStream,
  onEnableLocation,
  onReport,
  onClose,
}: {
  emergencyType: string;
  emergencyId: string | null;
  location: LocationInfo | null;
  locationState: LocationState;
  activityId: string | null;
  microphoneStream?: MediaStream;
  onEnableLocation: () => void;
  onReport: () => void;
  onClose: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(true);
  const [nearbyHelp, setNearbyHelp] = useState<Facility[]>([]);
  const [nearbyHelpLoading, setNearbyHelpLoading] = useState(false);

  const [servicesOpen, setServicesOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [update, setUpdate] = useState("");
  const area = location?.district || location?.suburb || "Location pending";
  const locationReady = locationState === "found" || locationState === "approximate";
  const closePanels = () => {
    setMoreOpen(false);
    setServicesOpen(false);
    setUpdateOpen(false);
  };

  useEffect(() => {
    if (!location || !locationReady) {
      setNearbyHelp([]);
      setNearbyHelpLoading(false);
      return;
    }

    let isActive = true;
    setNearbyHelpLoading(true);

    void loadNearbyFacilities(location.lat, location.lng)
      .then(({ hospitals, police }) => {
        if (!isActive) return;
        const ambulanceOptions = hospitals.slice(0, 2).map((item, index) => ({
          ...item,
          type: "ambulance" as const,
          name: index === 0 ? "Nearest ambulance / ER" : "Ambulance coordination",
          phone: "911",
          address: item.address || "Nearest response point",
          lat: item.lat ?? location.lat,
          lng: item.lng ?? location.lng,
        }));

        setNearbyHelp([
          ...hospitals.slice(0, 3),
          ...police.slice(0, 3),
          ...ambulanceOptions,
        ].slice(0, 6));
      })
      .catch(() => {
        if (isActive) setNearbyHelp([]);
      })
      .finally(() => {
        if (isActive) setNearbyHelpLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [locationReady, location]);

  return (
    <motion.main
      className="signal-screen signal-minimal relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#0d0f10] text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_50%_-20%,rgba(185,42,54,0.22),transparent_68%)]" />
      <header className="relative mx-auto flex w-full max-w-xl items-center justify-between border-b border-white/[0.08] px-5 py-5 sm:px-7">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-400 shadow-[0_0_0_4px_rgba(248,113,113,0.12)]" />
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-300">SOS ACTIVE <span className="text-white/40">• LIVE</span></p>
          </div>
          <p className="mt-3 truncate text-[12px] font-medium tracking-[0.02em] text-white/45">{emergencyId ?? "Emergency session"}</p>
          <p className="mt-0.5 truncate text-[12px] text-white/65">{EMERGENCY_TYPES.find((item) => item.id === emergencyType)?.label ?? "Other Emergency"}</p>
        </div>
        <button type="button" onClick={() => setCloseConfirm(true)} className="min-h-10 rounded-xl border border-white/15 bg-white/[0.03] px-4 text-[12px] font-semibold text-white/75 transition hover:border-white/25 hover:bg-white/[0.08]">
          Close
        </button>
      </header>

      <div className="relative mx-auto w-full max-w-xl px-5 pb-10 sm:px-7">
        <EmergencyCallEscalation activityId={activityId} emergencyType={emergencyType} microphoneStream={microphoneStream} compact />
        <SosRoomStrip activityId={activityId} />
        <AllmaVoice activityId={activityId} compact />

        <section aria-labelledby="actions-heading" className="border-b border-white/[0.08] py-6">
          <p id="actions-heading" className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/40">Immediate actions</p>
          <div className="mt-4 grid gap-2.5">
            <button type="button" onClick={() => setServicesOpen(true)} className="group flex min-h-14 items-center justify-between rounded-2xl bg-[#f5f5f2] px-4 text-left text-[14px] font-bold text-[#101214] shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition hover:bg-white active:scale-[0.99]">
              <span className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#101214]/[0.08]"><Phone className="h-4 w-4" /></span>Call Emergency Services</span><ChevronRight className="h-4 w-4 opacity-45 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button type="button" onClick={() => setUpdateOpen(true)} className="group flex min-h-14 items-center justify-between rounded-2xl border border-white/[0.12] bg-white/[0.035] px-4 text-left text-[14px] font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.07] active:scale-[0.99]">
              <span className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.07]"><Send className="h-4 w-4 text-white/70" /></span>Send Update</span><ChevronRight className="h-4 w-4 text-white/35 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button type="button" onClick={onReport} className="group flex min-h-14 items-center justify-between rounded-2xl border border-white/[0.12] bg-white/[0.035] px-4 text-left text-[14px] font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.07] active:scale-[0.99]">
              <span className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.07]"><Shield className="h-4 w-4 text-white/70" /></span>File an incident report</span><ChevronRight className="h-4 w-4 text-white/35 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button type="button" onClick={() => setCloseConfirm(true)} className="min-h-12 text-[12px] font-semibold tracking-[0.01em] text-red-300/85 transition hover:text-red-200">
              Stop SOS
            </button>
          </div>
        </section>
        </div>

        <div className="min-w-0">
        <section aria-labelledby="location-heading" className="border-b border-white/[0.08] py-6">
          <div className="flex items-center justify-between">
            <div>
              <p id="location-heading" className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/40">Location</p>
              <p className="mt-3 flex items-center gap-2 text-[14px] font-semibold text-white">
                <span className={cn("h-2 w-2 rounded-full", locationReady ? "bg-emerald-300 shadow-[0_0_0_4px_rgba(110,231,183,0.1)]" : "bg-amber-300 shadow-[0_0_0_4px_rgba(252,211,77,0.1)]")} />
                {locationReady ? "Shared" : "Unavailable"}
              </p>
              <p className="mt-1 text-[12px] text-white/45">{area}</p>
            </div>
            {locationReady ? (
              <button type="button" onClick={() => setMapOpen((open) => !open)} className="min-h-10 rounded-xl border border-white/15 bg-white/[0.03] px-3 text-[12px] font-semibold text-white/75 transition hover:bg-white/[0.08]">{mapOpen ? "Hide map" : "View map"}</button>
            ) : (
              <button type="button" onClick={onEnableLocation} className="min-h-10 rounded-xl border border-amber-300/30 bg-amber-300/[0.04] px-3 text-[12px] font-semibold text-amber-200 transition hover:bg-amber-300/10">Enable Location</button>
            )}
          </div>
          {locationReady && location && mapOpen && (
            <div className="mt-4">
              <LiveLocationMap location={location} />
            </div>
          )}
        </section>


        {locationReady && location && (
          <section aria-labelledby="nearby-help-heading" className="border-b border-white/[0.08] py-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p id="nearby-help-heading" className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/40">Nearby help</p>
                <p className="mt-2 text-[13px] font-semibold text-white">Hospitals, police and ambulance options near you</p>
              </div>
              {nearbyHelp.length > 0 && (
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
                  {nearbyHelp.length} ready
                </span>
              )}
            </div>

            {nearbyHelpLoading ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-[12px] text-white/60">
                Finding nearby emergency services…
              </div>
            ) : nearbyHelp.length ? (
              <div className="space-y-2.5">
                {nearbyHelp.map((facility) => (
                  <div key={`${facility.type}-${facility.name}-${facility.address}`} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3">
                    <div className="flex items-start gap-3">
                      <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", facility.type === "hospital" ? "bg-emerald-400/10 text-emerald-300" : facility.type === "ambulance" ? "bg-amber-400/10 text-amber-300" : "bg-sky-400/10 text-sky-300")}>
                        {facility.type === "hospital" ? <Building2 className="h-4 w-4" /> : facility.type === "ambulance" ? <Heart className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[13px] font-semibold text-white">{facility.name}</p>
                          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]", facility.type === "hospital" ? "bg-emerald-400/10 text-emerald-300" : facility.type === "ambulance" ? "bg-amber-400/10 text-amber-300" : "bg-sky-400/10 text-sky-300")}>{facility.type === "ambulance" ? "Ambulance" : facility.type === "police" ? "Police" : "Hospital"}</span>
                        </div>
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-white/55">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{facility.address}</span>
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-white/75">{facility.distance}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <a
                        href={
                          location
                            ? buildDirectionsUrl(
                                { lat: location.lat, lng: location.lng },
                                { lat: facility.lat ?? location.lat, lng: facility.lng ?? location.lng },
                              )
                            : "#"
                        }
                        target={location ? "_blank" : undefined}
                        rel={location ? "noreferrer" : undefined}
                        className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[11px] font-bold text-white transition hover:bg-white/[0.08]"
                      >
                        <Navigation2 className="h-3.5 w-3.5" /> Directions
                      </a>
                      <a
                        href={facility.phone ? `tel:${facility.phone.replace(/[^\d+]/g, "")}` : undefined}
                        className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[11px] font-bold text-white transition hover:bg-white/[0.08]"
                        onClick={(event) => {
                          if (!facility.phone) {
                            event.preventDefault();
                          }
                        }}
                      >
                        <Phone className="h-3.5 w-3.5" /> Call
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-[12px] text-white/60">
                We could not find nearby emergency services yet. Use the emergency phone numbers below instead.
              </div>
            )}
          </section>
        )}

          <button type="button" onClick={() => setMoreOpen(true)} className="group flex min-h-14 w-full items-center justify-between border-b border-white/[0.08] text-left">
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/40">More</span>
            <ChevronRight className="h-4 w-4 text-white/35 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>

      {(moreOpen || servicesOpen || updateOpen) && (
        <div className="fixed inset-0 z-20 flex items-end bg-black/70 p-3 backdrop-blur-[2px]" onClick={closePanels}>
          <div className="mx-auto w-full max-w-xl rounded-[1.75rem] border border-white/[0.12] bg-[#191c1f] p-5 shadow-[0_-16px_60px_rgba(0,0,0,0.38)]" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" />
            <div className="mb-5 flex items-center justify-between"><p className="text-sm font-semibold text-white">{servicesOpen ? "Emergency Services" : updateOpen ? "Send Update" : "More"}</p><button type="button" onClick={closePanels} aria-label="Close panel" className="grid h-9 w-9 place-items-center rounded-lg text-white/60 transition hover:bg-white/10"><X className="h-5 w-5" /></button></div>
            {servicesOpen && <div className="grid gap-2">{EMERGENCY_NUMBERS.map((service) => <a key={service.label} href={`tel:${service.number}`} className="flex min-h-12 items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[13px] text-white transition hover:bg-white/[0.07]"><span>{service.label}</span><span className="font-bold text-white/70">{service.number}</span></a>)}</div>}
            {updateOpen && <div><textarea value={update} onChange={(event) => setUpdate(event.target.value)} rows={3} placeholder="Tell responders what has changed" className="w-full resize-none rounded-xl border border-white/15 bg-black/20 p-3 text-[13px] text-white outline-none placeholder:text-white/35 focus:border-white/30" /><button type="button" onClick={() => { setUpdate(""); setUpdateOpen(false); }} disabled={!update.trim()} className="mt-3 min-h-12 w-full rounded-xl bg-[#f5f5f2] text-[13px] font-bold text-[#101214] transition hover:bg-white disabled:opacity-40">Send update</button></div>}
            {moreOpen && <div className="grid divide-y divide-white/10">{["✦  Allma AI · Need help?", "Activity ›", "Nearby help ›", "Location details ›"].map((item) => <button type="button" key={item} onClick={closePanels} className="min-h-14 text-left text-[13px] text-white/80 transition hover:text-white">{item}</button>)}</div>}
          </div>
        </div>
      )}
      {closeConfirm && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#191c1f] p-5 shadow-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-300">End SOS</p>
            <h2 className="mt-2 text-xl font-bold text-white">Are you sure you are safe?</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-white/60">
              Ending SOS stops this emergency session and its active response path.
            </p>
            <div className="mt-5 grid gap-2">
              <button type="button" onClick={() => setCloseConfirm(false)} className="min-h-12 rounded-xl border border-white/15 text-[13px] font-bold text-white transition hover:bg-white/10">
                No, keep SOS active
              </button>
              <button type="button" onClick={onClose} className="min-h-12 rounded-xl bg-red-500 text-[13px] font-black text-white transition hover:bg-red-400">
                Yes, end SOS
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.main>
  );
}

// ─── Report ───────────────────────────────────────────────────────────────────

function ReportScreen({
  reportText,
  setReportText,
  onSubmit,
  onBack,
  submitting,
  emergencyType,
  emergencyId,
  activatedAt,
  locationState,
  respondersNotified,
  responderCount,
}: {
  reportText: string;
  setReportText: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
  emergencyType: string;
  emergencyId: string | null;
  activatedAt: number | null;
  locationState: LocationState;
  respondersNotified: boolean;
  responderCount: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!activatedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activatedAt]);

  const elapsed = activatedAt ? Math.max(0, Math.floor((now - activatedAt) / 1000)) : null;
  const elapsedLabel =
    elapsed === null
      ? "Not recorded"
      : `${String(Math.floor(elapsed / 3600)).padStart(2, "0")}:${String(
          Math.floor((elapsed % 3600) / 60),
        ).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  const locationLabel =
    locationState === "found"
      ? "Precise GPS attached"
      : locationState === "approximate"
        ? "Approximate location attached"
        : locationState === "finding"
          ? "Finding your location…"
          : locationState === "denied"
            ? "Location permission denied"
            : "Location unavailable";
  const locationTone =
    locationState === "found" || locationState === "approximate"
      ? "bg-emerald-400"
      : locationState === "finding"
        ? "bg-[#FCDC04]"
        : "bg-white/25";

  const rows: Array<{ label: string; value: string; tone: string }> = [
    {
      label: "Emergency type",
      value: EMERGENCY_TYPES.find((item) => item.id === emergencyType)?.label ?? "Other emergency",
      tone: "bg-[#FCDC04]",
    },
    { label: "Elapsed time", value: elapsedLabel, tone: "bg-white/25" },
    { label: "Location status", value: locationLabel, tone: locationTone },
    {
      label: "Safety network",
      value: respondersNotified
        ? responderCount > 0
          ? `${responderCount} responder${responderCount === 1 ? "" : "s"} contacted`
          : "Contacting your network"
        : "Not sharing with responders",
      tone: respondersNotified ? "bg-[#FCDC04]" : "bg-white/25",
    },
  ];

  return (
    <motion.div
      className="signal-screen signal-report flex h-full flex-col items-center overflow-y-auto bg-[#0a0a0a] px-4 py-6 text-white sm:px-6 md:justify-center md:py-10"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.28 }}
    >
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_-25%,rgba(217,0,18,0.18),transparent_70%)]" />
      <div className="relative grid w-full max-w-6xl grid-cols-1 overflow-hidden rounded-3xl border border-white/10 bg-[#1a1a1a] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] md:grid-cols-12">
        <div className="flex flex-col justify-between border-b border-white/10 bg-[#141414] p-6 sm:p-8 md:col-span-5 md:border-b-0 md:border-r md:p-11">
          <div>
            <div className="mb-7 inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/60">
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-400" />
              <span className="truncate">
                {emergencyId ? `Session ${emergencyId.slice(0, 8)}` : "Session starting"}
              </span>
            </div>
            <h2 className="mb-8 font-display text-3xl font-bold tracking-tight md:mb-11 md:text-4xl">
              Incident
              <br />
              overview
            </h2>
            <div className="space-y-6 md:space-y-8">
              {rows.map((row, index) => (
                <motion.div
                  key={row.label}
                  className="flex items-start gap-4"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 * index + 0.08, duration: 0.3 }}
                >
                  <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", row.tone)} />
                  <div className="min-w-0">
                    <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-white/40">
                      {row.label}
                    </p>
                    <p className="text-[17px] font-medium leading-snug tabular-nums">{row.value}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
          <p className="mt-10 hidden border-t border-white/[0.07] pt-7 text-[11px] leading-relaxed text-white/30 md:block">
            Your report is stored on your Allma account with a reference code. Allma does not contact
            an authority automatically.
          </p>
        </div>

        <div className="flex min-h-[480px] flex-col p-6 sm:p-8 md:col-span-7 md:p-11">
          <div className="flex-grow">
            <button
              type="button"
              onClick={onBack}
              className="group mb-7 inline-flex items-center gap-2 text-[13px] text-white/60 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
              Back to status
            </button>
            <h1 className="mb-7 font-display text-2xl font-bold tracking-tight md:text-[26px]">
              Quick incident report
            </h1>
            <label htmlFor="sos-report" className="mb-3 block text-[13px] font-medium text-white/80">
              What happened?
            </label>
            <div className="relative">
              <textarea
                id="sos-report"
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                placeholder="Briefly describe the situation — e.g. 'A man grabbed my bag near Shoprite and ran toward the market.'"
                maxLength={2000}
                className="min-h-[220px] w-full resize-none rounded-xl border border-white/10 bg-black/40 p-5 pb-9 text-[15px] leading-relaxed text-white/90 outline-none transition-all placeholder:text-white/25 focus:border-[#FCDC04]/50 focus:ring-1 focus:ring-[#FCDC04]/20"
              />
              <span className="pointer-events-none absolute bottom-4 right-4 text-[10px] tracking-[0.14em] text-white/30 tabular-nums">
                {reportText.length} / 2000
              </span>
            </div>
          </div>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row-reverse sm:items-center">
            <motion.button
              type="button"
              onClick={onSubmit}
              disabled={submitting}
              whileTap={{ scale: 0.98 }}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#D90012] px-10 font-display text-[14px] font-bold uppercase tracking-[0.08em] text-white shadow-[0_18px_40px_-20px_rgba(217,0,18,0.9)] transition hover:bg-[#b80010] disabled:opacity-60 sm:w-auto"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {submitting ? "Submitting…" : "Submit report"}
            </motion.button>
            <button
              type="button"
              onClick={onBack}
              className="flex min-h-[52px] w-full items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.04] px-10 text-[13px] font-medium text-white/60 transition hover:bg-white/10 hover:text-white sm:w-auto"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}


// ─── Submitted ────────────────────────────────────────────────────────────────

function SubmittedScreen({ reference, onDone }: { reference: string | null; onDone: () => void }) {
  return (
    <motion.div
      className="signal-screen signal-submitted flex h-full flex-col items-center justify-center bg-[#0a0a0a] px-4 py-8 text-white sm:px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
    >
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_-25%,rgba(252,220,4,0.12),transparent_70%)]" />
      <motion.div
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#1a1a1a] p-8 text-center shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] sm:p-10"
        initial={{ opacity: 0, y: 14, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, type: "spring", stiffness: 220, damping: 22 }}
      >
        <motion.div
          className="mx-auto mb-7 grid h-16 w-16 place-items-center rounded-full bg-emerald-400/15 ring-1 ring-emerald-400/30"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 20 }}
        >
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        </motion.div>
        <motion.h2
          className="mb-2 font-display text-2xl font-bold tracking-tight"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
        >
          Report submitted
        </motion.h2>
        {reference && (
          <motion.div
            className="mx-auto mb-6 mt-5 rounded-2xl border border-[#FCDC04]/25 bg-[#FCDC04]/[0.06] px-6 py-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
          >
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">Reference</p>
            <p className="mt-1.5 font-display text-2xl font-bold tracking-[0.06em] text-[#FCDC04]">
              {reference}
            </p>
          </motion.div>
        )}
        <motion.p
          className="mx-auto mb-8 max-w-sm text-[13.5px] leading-relaxed text-white/55"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26 }}
        >
          Your report is saved locally with the reference above. Allma has not contacted an authority
          or responder automatically. Stay safe and use the official call options if you need urgent
          help.
        </motion.p>
        <motion.button
          type="button"
          onClick={onDone}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.05] text-[14px] font-semibold text-white transition hover:bg-white/10"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          whileTap={{ scale: 0.98 }}
        >
          Close SOS <ChevronRight className="h-4 w-4" />
        </motion.button>
      </motion.div>
    </motion.div>
  );

}
