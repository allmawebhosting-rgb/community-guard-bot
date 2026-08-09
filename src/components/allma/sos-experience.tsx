import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "idle" | "type-select" | "consent" | "loading" | "help" | "report" | "submitted";

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
  type: "hospital" | "police";
  distance: string;
  phone: string;
  address: string;
};

type ResponderStatus = "offered" | "accepted" | "declined" | "en_route" | "arrived" | "cancelled";
type Responder = {
  id: string;
  offerId: string;
  name: string;
  distance: string;
  eta: string;
  status: ResponderStatus;
  verified: boolean;
};

type ResponderOffer = {
  offer_id: string;
  responder_id: string;
  display_name: string;
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

const DEMO_HOSPITALS: Omit<Facility, "distance">[] = [
  {
    name: "Mulago National Referral Hospital",
    type: "hospital",
    phone: "+256 414 541 188",
    address: "Mulago Hill Road, Kampala",
  },
  {
    name: "International Hospital Kampala",
    type: "hospital",
    phone: "+256 312 200 400",
    address: "Namuwongo, Kampala",
  },
  {
    name: "Nsambya Hospital",
    type: "hospital",
    phone: "+256 414 268 614",
    address: "Nsambya, Kampala",
  },
  {
    name: "Case Clinic Kampala",
    type: "hospital",
    phone: "+256 312 200 150",
    address: "Mackinnon Road, Kampala",
  },
];

const DEMO_OFFICERS: Omit<Facility, "distance">[] = [
  {
    name: "Inspector Sarah N. — Available",
    type: "police",
    phone: "+256 774 620 951",
    address: "Central Police Station, Kampala",
  },
  {
    name: "Sergeant David K. — Patrolling",
    type: "police",
    phone: "+256 774 620 951",
    address: "East Division, Kampala",
  },
  {
    name: "Corporal Grace A. — Available",
    type: "police",
    phone: "+256 774 620 951",
    address: "North Patrol Unit, Kampala",
  },
];

const DEMO_COORDS: Record<string, [number, number]> = {
  "Mulago National Referral Hospital": [0.3374, 32.576],
  "International Hospital Kampala": [0.3004, 32.6137],
  "Nsambya Hospital": [0.2999, 32.5908],
  "Case Clinic Kampala": [0.319, 32.5861],
  "Inspector Sarah N. — Available": [0.3144, 32.5797],
  "Sergeant David K. — Patrolling": [0.3211, 32.591],
  "Corporal Grace A. — Available": [0.3402, 32.5662],
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

function withDistance(items: Omit<Facility, "distance">[], lat: number, lng: number): Facility[] {
  return items
    .map((f) => {
      const coords = DEMO_COORDS[f.name];
      const km = coords ? haversineKm(lat, lng, coords[0], coords[1]) : null;
      const distance =
        km != null ? (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`) : "Nearby";
      return { ...f, distance };
    })
    .sort((a, b) => {
      const parse = (d: string) =>
        parseFloat(d.replace(/[^\d.]/g, "")) * (d.includes("km") ? 1000 : 1);
      return parse(a.distance) - parse(b.distance);
    });
}

async function fetchOverpass(
  lat: number,
  lng: number,
  amenity: "hospital" | "police",
): Promise<Facility[]> {
  const r = 8000;
  const query = `[out:json][timeout:5];(node[amenity=${amenity}](around:${r},${lat},${lng});way[amenity=${amenity}](around:${r},${lat},${lng}););out center 4;`;
  const res = await fetch(
    `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
  );
  const data = await res.json();
  const items: Facility[] = (data.elements || []).map((el: Record<string, unknown>) => {
    const tags = (el.tags || {}) as Record<string, string>;
    const elLat =
      typeof el.lat === "number" ? el.lat : ((el.center as Record<string, number>)?.lat ?? lat);
    const elLng =
      typeof el.lon === "number" ? el.lon : ((el.center as Record<string, number>)?.lon ?? lng);
    const km = haversineKm(lat, lng, elLat, elLng);
    return {
      name: tags.name || (amenity === "hospital" ? "Hospital" : "Police Station"),
      type: amenity,
      phone: tags.phone || tags["contact:phone"] || (amenity === "hospital" ? "911" : "999"),
      address: tags["addr:street"]
        ? `${tags["addr:housenumber"] || ""} ${tags["addr:street"]}`.trim()
        : "Nearby",
      distance: km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`,
    };
  });
  return items.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
}

function getLocation(): Promise<LocationInfo> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("no geo"));
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
        else reject(err);
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
    ) => Promise<{ data: ResponderOffer[] | null; error: unknown }>;
  };
  const { data, error } = await client.rpc("create_sos_responder_offers", {
    p_sos_activity_id: activityId,
    p_radius_meters: radiusMeters,
  });
  if (error) {
    console.warn("Responder offer creation unavailable", error);
    return [];
  }
  return data ?? [];
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
    `Emergency mode activated. I'm locating you and determining the fastest available assistance.`,
    location
      ? `Your location is available in ${loc}. You decide which contacts receive it.`
      : `Location is unavailable or not shared. You can still call for help.`,
    typeMsg[type] ?? typeMsg.other,
    `If you consented, I'm checking for opted-in Allma responders within ${(COMMUNITY_RADIUS[type] ?? 1000) / 1000} km. Their exact locations stay private.`,
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
        {responder.name
          .split(" ")
          .map((p) => p[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()}
        {responder.verified && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-info text-[9px] font-black text-info-foreground">
            ✓
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[13px] font-semibold text-foreground">{responder.name}</p>
          {responder.verified && (
            <span className="rounded-full border border-info/30 bg-info/18 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-info">
              Verified
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Approx. {responder.distance} away · {responder.eta}
        </p>
      </div>
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
        <a
          href={`tel:${facility.phone.replace(/\s/g, "")}`}
          className="flex min-h-8 items-center gap-1 rounded-lg border border-border/70 bg-secondary px-2.5 py-1 text-[10px] font-bold text-foreground transition hover:border-primary/40 hover:bg-accent"
        >
          <Phone className="h-2.5 w-2.5" /> Call
        </a>
      </div>
    </div>
  );
}

function FacilitySection({
  title,
  facilities,
  demo,
}: {
  title: string;
  facilities: Facility[];
  demo?: boolean;
}) {
  if (!facilities.length) return null;
  return (
    <div>
      <SectionLabel>
        {title}
        {demo && (
          <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground">
            (demo)
          </span>
        )}
      </SectionLabel>
      <div className="space-y-2">
        {facilities.map((f, i) => (
          <FacilityRow key={i} facility={f} />
        ))}
      </div>
    </div>
  );
}

// ─── Live location map ────────────────────────────────────────────────────────

const MAP_ZOOM_LEVELS = [
  { label: "Street", span: 250 },
  { label: "Block", span: 700 },
  { label: "Area", span: 2000 },
  { label: "City", span: 6000 },
] as const;

const MAP_HEIGHT = 208;

function LiveLocationMap({ location }: { location: LocationInfo }) {
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);
  const level = MAP_ZOOM_LEVELS[zoom];

  // Half-span of the viewport in metres → degrees for the OSM bbox.
  const halfSpan = level.span / 2;
  const dLat = halfSpan / 111_320;
  const dLng = halfSpan / (111_320 * Math.max(0.2, Math.cos((location.lat * Math.PI) / 180)));
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${location.lng - dLng},${
    location.lat - dLat
  },${location.lng + dLng},${location.lat + dLat}&layer=mapnik&marker=${location.lat},${location.lng}`;

  // Accuracy circle drawn to the same scale as the tiles.
  const metresPerPixel = level.span / MAP_HEIGHT;
  const accuracyPx = Math.max(18, Math.min(MAP_HEIGHT * 0.9, (location.accuracy / metresPerPixel) * 2));

  const coords = `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;

  const copyCoords = async () => {
    try {
      await navigator.clipboard.writeText(coords);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="premium-surface shadow-soft overflow-hidden rounded-2xl border border-border/60">
      <div className="relative bg-muted" style={{ height: MAP_HEIGHT }}>
        <iframe
          key={mapUrl}
          src={mapUrl}
          title="Your live location"
          loading="lazy"
          className="map-tint h-full w-full border-0"
        />

        {/* Accuracy radius + pulsing position marker */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span
            className="absolute rounded-full border border-destructive/40 bg-destructive/10"
            style={{ height: accuracyPx, width: accuracyPx }}
          />
          <span className="absolute h-12 w-12 animate-ping rounded-full bg-destructive/20 [animation-duration:1.6s]" />
          <span className="sos-glow-sm h-3.5 w-3.5 rounded-full border-2 border-background bg-destructive" />
        </div>

        {/* Scale + zoom controls */}
        <div className="absolute right-2.5 top-2.5 flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background/80 backdrop-blur-md">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.max(0, z - 1))}
            disabled={zoom === 0}
            className="grid h-9 w-9 place-items-center bg-background/90 text-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <span className="h-px bg-border" />
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.min(MAP_ZOOM_LEVELS.length - 1, z + 1))}
            disabled={zoom === MAP_ZOOM_LEVELS.length - 1}
            className="grid h-9 w-9 place-items-center bg-background/90 text-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="h-px bg-border" />
          <button
            type="button"
            aria-label="Recenter on me"
            onClick={() => setZoom(1)}
            className="grid h-9 w-9 place-items-center bg-background/90 text-destructive transition hover:bg-accent"
          >
            <Crosshair className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground backdrop-blur-md">
          <LocateFixed className="h-3 w-3 text-success" />
          {level.label} · ±{Math.round(location.accuracy)} m
        </div>
      </div>

      <div className="flex items-start gap-2 border-t border-border/60 px-4 py-3">
        <Navigation2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold text-foreground">
            {location.address}
            {location.district ? `, ${location.district}` : ""}
          </p>
          <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{coords}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border/60 p-2.5">
        <a
          href={`https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=17/${location.lat}/${location.lng}`}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border/70 bg-secondary px-3 py-2 text-[11.5px] font-bold text-foreground transition hover:border-primary/40 hover:bg-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open in Maps
        </a>
        <button
          type="button"
          onClick={copyCoords}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[11.5px] font-semibold transition",
            copied
              ? "border-success/30 bg-success/15 text-success"
              : "border-border/60 bg-secondary/40 text-foreground hover:bg-accent",
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy GPS"}
        </button>
      </div>
    </div>
  );
}

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

export function SOSExperience({ instant }: { instant?: boolean } = {}) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>(instant ? "loading" : "idle");

  const [emergencyType, setEmergencyType] = useState("other");
  const [pendingEmergencyType, setPendingEmergencyType] = useState("other");
  const [shareLocation, setShareLocation] = useState(true);
  const [notifyResponders, setNotifyResponders] = useState(true);
  const [location, setLocation] = useState<LocationInfo | null>(null);
  const [hospitals, setHospitals] = useState<Facility[]>([]);
  const [officers, setOfficers] = useState<Facility[]>([]);
  const [trustedContacts, setTrustedContacts] = useState<TrustedContact[]>([]);
  const [responderOffers, setResponderOffers] = useState<ResponderOffer[]>([]);
  const [sosActivityId, setSosActivityId] = useState<string | null>(null);
  const [reportText, setReportText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const activated = useRef(false);

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

  useEffect(() => {
    if (!instant || activated.current) return;
    void activateEmergency();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instant]);

  function handleSosPress() {
    setPhase("type-select");
  }

  function handleTypeSelect(type: string) {
    setPendingEmergencyType(type);
    setShareLocation(true);
    setNotifyResponders(true);
    setPhase("consent");
  }

  async function activateEmergency() {
    const type = pendingEmergencyType;
    if (activated.current) return;
    activated.current = true;
    setSosActivityId(null);
    setResponderOffers([]);
    setEmergencyType(type);
    setPhase("loading");

    let loc: LocationInfo | null = null;
    try {
      loc = await getLocation();
    } catch {
      loc = null;
    }
    setLocation(shareLocation ? loc : null);

    let activityId: string | null = null;
    if (user && loc) {
      const { data: activity, error } = await supabase
        .from("safety_activity")
        .insert({
          user_id: user.id,
          activity_type: "sos_activated",
          title: "Emergency SOS activated",
          summary: `SOS activated for ${EMERGENCY_TYPES.find((item) => item.id === type)?.label ?? "an emergency"}.`,
          severity: "critical",
          location_text: `${loc.address}, ${loc.district}`.replace(/, $/, ""),
          latitude: shareLocation ? loc.lat : null,
          longitude: shareLocation ? loc.lng : null,
          details: {
            channel: "sos",
            emergency_type: type,
            accuracy_m: loc.accuracy,
            location_consent: shareLocation,
            responder_notification_consent: notifyResponders,
            coordination_mode: "consent_based",
          } as never,
        })
        .select("id")
        .single();
      activityId = activity?.id ?? null;
      setSosActivityId(activityId);
      if (error) console.error("Failed to record SOS activity", error);
    }

    if (user) {
      const { data: contacts, error } = await supabase
        .from("emergency_contacts")
        .select("id, name, phone, relationship")
        .order("created_at", { ascending: true });
      if (!error) setTrustedContacts((contacts ?? []) as TrustedContact[]);
    }

    if (loc && shareLocation) {
      const [realHospitals, realPolice, offers] = await Promise.all([
        fetchOverpass(loc.lat, loc.lng, "hospital").catch(() => [] as Facility[]),
        fetchOverpass(loc.lat, loc.lng, "police").catch(() => [] as Facility[]),
        activityId && notifyResponders
          ? createResponderOffers(activityId, COMMUNITY_RADIUS[type] ?? 1000)
          : Promise.resolve([]),
      ]);
      setHospitals(
        realHospitals.length >= 2
          ? realHospitals.slice(0, 4)
          : withDistance(DEMO_HOSPITALS, loc.lat, loc.lng),
      );
      setOfficers(
        realPolice.length >= 1
          ? realPolice.slice(0, 3)
          : withDistance(DEMO_OFFICERS, loc.lat, loc.lng),
      );
      setResponderOffers(offers);
    } else {
      setHospitals([]);
      setOfficers([]);
      setResponderOffers([]);
    }
    setPhase("help");
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
    <div className="fixed inset-0 z-[100] flex h-[100dvh] w-screen max-w-full flex-col overflow-hidden bg-background">
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
        {phase === "idle" && <IdleScreen key="idle" onActivate={handleSosPress} />}
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
        {phase === "loading" && <LoadingScreen key="loading" />}
        {phase === "help" && (
          <HelpScreen
            key="help"
            emergencyType={emergencyType}
            location={location}
            hospitals={hospitals}
            officers={officers}
            trustedContacts={trustedContacts}
            responsePlan={RESPONSE_PLANS[emergencyType] ?? RESPONSE_PLANS.other}
            locationShared={shareLocation}
            respondersNotified={notifyResponders}
            responderOffers={responderOffers}
            activityId={sosActivityId}
            onChangeType={(next) => {
              setPendingEmergencyType(next);
              setEmergencyType(next);
            }}
            onToggleLocation={() => setShareLocation((v) => !v)}
            onToggleResponders={() => setNotifyResponders((v) => !v)}
            onReport={() => setPhase("report")}

            onClose={() => {
              activated.current = false;
              setSosActivityId(null);
              setResponderOffers([]);
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
              setPhase("idle");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Idle ─────────────────────────────────────────────────────────────────────

function IdleScreen({ onActivate }: { onActivate: () => void }) {
  return (
    <motion.div
      className="flex min-h-0 flex-1 flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.3 }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 sm:px-6 sm:py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-full bg-destructive/18">
            <Siren className="h-3.5 w-3.5 text-destructive" strokeWidth={1.5} />
          </div>
          <span className="truncate text-[13px] font-semibold text-foreground">Allma Safety AI</span>
        </div>
        <span className="rounded-full border border-destructive/25 bg-destructive/18 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-destructive">
          Demo
        </span>
      </div>

      {/* Main area — side by side on desktop */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-7 sm:px-6 sm:py-8 lg:flex lg:flex-row lg:items-center lg:justify-center lg:gap-24 lg:overflow-hidden lg:py-0">
        {/* Left: button */}
        <div className="flex flex-col items-center text-center">
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
            className="mb-8 text-[13px] text-muted-foreground sm:mb-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            Tap once for immediate help
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
              className="relative h-[min(13rem,58vw)] w-[min(13rem,58vw)] rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background sm:h-52 sm:w-52"
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
            className="mt-8 text-[11px] text-muted-foreground sm:mt-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            Demo · No real services contacted
          </motion.p>
        </div>

        {/* Right: info panel — stacked below the button on mobile */}
        <motion.div
          className="mb-5 mt-8 w-full max-w-sm space-y-3 lg:mb-0 lg:mt-10 lg:w-72 lg:max-w-none"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Emergency Numbers
          </p>
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
            Allma AI guides you through an emergency, locates nearby services, and connects
            community responders — automatically.
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
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
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
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
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

function LoadingScreen() {
  const steps = [
    "Activating emergency mode…",
    "Detecting precise GPS location…",
    "Preparing the right response path…",
    "Searching for opted-in responders…",
  ];
  const [step, setStep] = useState(0);
  const [aiText, setAiText] = useState("");
  const aiFull =
    "Emergency mode activated. I'm locating you and determining the fastest available assistance.";

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
      className="flex h-full flex-col items-center justify-center px-8 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="relative mb-10 flex items-center justify-center">
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

// ─── Help ─────────────────────────────────────────────────────────────────────

function HelpScreen({
  emergencyType,
  location,
  hospitals,
  officers,
  trustedContacts,
  responsePlan,
  locationShared,
  respondersNotified,
  responderOffers,
  activityId,
  onChangeType,
  onToggleLocation,
  onToggleResponders,
  onReport,
  onClose,
}: {
  emergencyType: string;
  location: LocationInfo | null;
  hospitals: Facility[];
  officers: Facility[];
  trustedContacts: TrustedContact[];
  responsePlan: ResponseTarget[];
  locationShared: boolean;
  respondersNotified: boolean;
  responderOffers: ResponderOffer[];
  activityId: string | null;
  onChangeType: (type: string) => void;
  onToggleLocation: () => void;
  onToggleResponders: () => void;
  onReport: () => void;
  onClose: () => void;
}) {
  const info = HELP_INFO[emergencyType] ?? HELP_INFO.other;
  const typeInfo = EMERGENCY_TYPES.find((t) => t.id === emergencyType);
  const TypeIcon = typeInfo?.icon ?? AlertTriangle;
  const showPoliceFirst = ["crime", "attack", "domestic", "missing"].includes(emergencyType);

  const aiMessages = useRef(getAiMessages(emergencyType, location)).current;
  const { log: aiLog, typing: aiTyping } = useAiChat(aiMessages);

  const [status, setStatus] = useState({ police: false, hospital: false, community: false });
  const [liveOffers, setLiveOffers] = useState(responderOffers);
  const [calledTargets, setCalledTargets] = useState<string[]>([]);
  const [escalationAction, setEscalationAction] = useState<EscalationAction | null>(null);
  const responders: Responder[] = liveOffers.map((offer) => ({
    id: offer.offer_id,
    offerId: offer.offer_id,
    name: offer.display_name || "Nearby responder",
    distance: formatDistanceMeters(offer.distance_m),
    eta: "available",
    status: offer.status,
    verified: false,
  }));

  const nearestResponder = responders[0];
  const isViolentEmergency = ["crime", "attack", "domestic"].includes(emergencyType);

  function runEscalationAction(action: EscalationAction) {
    setEscalationAction(action);
    if (action === "police") {
      setCalledTargets((current) =>
        current.includes("Police") ? current : [...current, "Police"],
      );
    }
    if (action === "ambulance") {
      setCalledTargets((current) =>
        current.includes("Ambulance") ? current : [...current, "Ambulance"],
      );
    }
  }

  useEffect(() => {
    setLiveOffers(responderOffers);
  }, [responderOffers]);

  useEffect(() => {
    if (!activityId) return;
    const channel = supabase
      .channel(`sos-responder-offers-${activityId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sos_responder_offers",
          filter: `sos_activity_id=eq.${activityId}`,
        },
        (payload) => {
          const changed = payload.new as { id?: string; status?: ResponderStatus };
          if (!changed.id || !changed.status) return;
          setLiveOffers((current) =>
            current.map((offer) =>
              offer.offer_id === changed.id
                ? { ...offer, status: changed.status as ResponderStatus }
                : offer,
            ),
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activityId]);

  const TIMELINE = [
    { label: "SOS Activated", sub: "Emergency mode engaged" },
    {
      label: locationShared ? "Location Shared" : "Location Not Shared",
      sub: locationShared
        ? [location?.suburb, location?.district].filter(Boolean).join(", ") || "Current area"
        : "You chose not to share GPS",
    },
    { label: "Response Path Ready", sub: "Tap a call action when you are ready" },
    {
      label: respondersNotified ? "Responder Search Started" : "Responder Search Skipped",
      sub: respondersNotified
        ? `${(COMMUNITY_RADIUS[emergencyType] ?? 1000) / 1000} km consented radius`
        : "No community responders were notified",
    },
    {
      label: "Live Response Status",
      sub: liveOffers.length
        ? `${liveOffers.length} opted-in people alerted`
        : "Waiting for a responder to accept",
    },
  ];
  const [timelineDone, setTimelineDone] = useState(locationShared ? 2 : 1);

  useEffect(() => {
    const ts: ReturnType<typeof setTimeout>[] = [];
    const add = (ms: number, fn: () => void) => ts.push(setTimeout(fn, ms));
    if (
      emergencyType === "medical" ||
      emergencyType === "accident" ||
      emergencyType === "fire" ||
      emergencyType === "other"
    ) {
      add(1200, () => setStatus((s) => ({ ...s, hospital: true })));
    }
    if (["crime", "attack", "domestic", "missing", "accident", "fire"].includes(emergencyType)) {
      add(1800, () => setStatus((s) => ({ ...s, police: true })));
    }
    if (respondersNotified) {
      add(3600, () => {
        setStatus((s) => ({ ...s, community: true }));
        setTimelineDone(4);
      });
    } else {
      add(2800, () => setTimelineDone(3));
    }
    return () => ts.forEach(clearTimeout);
  }, [emergencyType, respondersNotified]);

  // ── Shared sections (rendered on both mobile and desktop) ──
  const AiSection = (
    <div className="space-y-2.5">
      <SectionLabel>
        <Brain className="mr-1.5 inline-block h-3 w-3 align-middle" />
        Allma AI — live guidance
      </SectionLabel>
      <div className="space-y-2">
        {aiLog.map((msg, i) => (
          <AiChatBubble key={i} text={msg} />
        ))}
        {aiTyping && <AiChatBubble text={aiTyping} typing />}
      </div>
    </div>
  );

  const StepsSection = (
    <motion.div
      className="rounded-2xl border border-destructive/30 bg-destructive/18 p-5"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.22 }}
    >
      <SectionLabel>
        <AlertTriangle className="mr-1.5 inline-block h-3 w-3 align-middle" />
        What to do right now
      </SectionLabel>
      <ol className="space-y-3">
        {info.steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-destructive/25 text-[10px] font-black text-foreground">
              {i + 1}
            </span>
            <span className="text-[14px] leading-snug text-foreground">{step}</span>
          </li>
        ))}
      </ol>
    </motion.div>
  );

  const TimelineSection = (
    <div>
      <SectionLabel>
        <Clock className="mr-1.5 inline-block h-3 w-3 align-middle" />
        Emergency timeline
      </SectionLabel>
      <div>
        {TIMELINE.map((ev, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[9px] transition-all duration-500",
                  i < timelineDone
                    ? "border-success/30 bg-success/18 text-success"
                    : "border-border/60 text-muted-foreground",
                )}
              >
                {i < timelineDone ? "✓" : "·"}
              </div>
              {i < TIMELINE.length - 1 && (
                <div
                  className={cn(
                    "mt-1 w-px transition-all duration-700",
                    i < timelineDone ? "bg-success/30" : "bg-secondary/60",
                  )}
                  style={{ minHeight: 22 }}
                />
              )}
            </div>
            <div className="pb-4">
              <p
                className={cn(
                  "text-[13px] font-medium transition-colors duration-500",
                  i < timelineDone ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {ev.label}
              </p>
              {ev.sub && (
                <p
                  className={cn(
                    "text-[11px] transition-colors duration-500",
                    i < timelineDone ? "text-muted-foreground" : "text-muted-foreground",
                  )}
                >
                  {ev.sub}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const CallSection = (
    <div>
      <SectionLabel>
        <Phone className="mr-1.5 inline-block h-3 w-3 align-middle" />
        Call now — your consent required
      </SectionLabel>
      <div className="grid grid-cols-2 gap-2.5">
        {info.primaryNumbers.map((e) => (
          <a
            key={e.label + e.number}
            href={`tel:${e.number}`}
            onClick={() =>
              setCalledTargets((current) =>
                current.includes(e.label) ? current : [...current, e.label],
              )
            }
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-2 rounded-2xl bg-gradient-to-br py-5 transition active:scale-[0.96]",
              e.gradient,
            )}
            style={{ boxShadow: `0 6px 24px -8px color-mix(in oklab, ${e.glow} 60%, transparent)` }}
          >
            <Phone className="h-4 w-4 opacity-75" />
            <span className="font-display text-[26px] font-black leading-none">
              {e.number}
            </span>
            <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] opacity-75">
              {calledTargets.includes(e.label) ? "Call started" : e.label}
            </span>
          </a>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        Allma cannot place calls automatically. Tap a number to use your device dialer and share
        details with the operator.
      </p>
    </div>
  );

  const ResponsePlanSection = (
    <div>
      <SectionLabel>
        <Radio className="mr-1.5 inline-block h-3 w-3 align-middle" />
        Who is in the response path
      </SectionLabel>
      <div className="space-y-2">
        {responsePlan.map((target) => (
          <div
            key={target.level}
            className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/40 px-3.5 py-3"
          >
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-black",
                target.tone === "red"
                  ? "bg-destructive/18 text-destructive"
                  : target.tone === "blue"
                    ? "bg-info/18 text-info"
                    : target.tone === "amber"
                      ? "bg-gold/18 text-gold"
                      : "bg-trusted/18 text-trusted",
              )}
            >
              L{target.level}
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-foreground">{target.label}</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{target.detail}</p>
            </div>
            <span className="ml-auto shrink-0 rounded-full border border-border/60 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
              {target.level === 4
                ? "Tap to call"
                : target.level === 2 && respondersNotified
                  ? "Searching"
                  : "Ready"}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        No community member is asked to confront a suspect. Responders only help when the scene is
        safe.
      </p>
    </div>
  );

  const TrustedContactsSection =
    trustedContacts.length > 0 ? (
      <div>
        <SectionLabel>
          <Users className="mr-1.5 inline-block h-3 w-3 align-middle" />
          Trusted contacts — tap to notify
        </SectionLabel>
        <div className="space-y-2">
          {trustedContacts.slice(0, 3).map((contact) => (
            <a
              key={contact.id}
              href={`tel:${contact.phone.replace(/\s/g, "")}`}
              onClick={() =>
                setCalledTargets((current) =>
                  current.includes(contact.id) ? current : [...current, contact.id],
                )
              }
              className="flex items-center gap-3 rounded-xl border border-trusted/15 bg-trusted/18 px-3.5 py-3 transition hover:bg-trusted/18"
            >
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-trusted/18 text-[11px] font-bold text-trusted">
                {contact.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-foreground">{contact.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {contact.relationship || "Trusted contact"} · {contact.phone}
                </p>
              </div>
              <span className="flex items-center gap-1 rounded-lg bg-trusted/18 px-2.5 py-1.5 text-[10px] font-bold text-trusted">
                <Phone className="h-3 w-3" />{" "}
                {calledTargets.includes(contact.id) ? "Called" : "Call"}
              </span>
            </a>
          ))}
        </div>
      </div>
    ) : null;

  const ControlsSection = (
    <div>
      <SectionLabel>
        <Settings2 className="mr-1.5 inline-block h-3 w-3 align-middle" />
        Adjust this emergency
      </SectionLabel>
      <div className="space-y-2.5 rounded-2xl border border-border/60 bg-secondary/40 p-3.5">
        <div className="flex flex-wrap gap-1.5">
          {EMERGENCY_TYPES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeType(item.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition",
                item.id === emergencyType
                  ? "border-destructive/40 bg-destructive/18 text-destructive"
                  : "border-border/60 bg-secondary/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onToggleLocation}
            aria-pressed={locationShared}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[11.5px] font-semibold transition",
              locationShared
                ? "border-success/25 bg-success/18 text-success"
                : "border-border/60 bg-secondary/40 text-muted-foreground",
            )}
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {locationShared ? "Sharing location" : "Location sharing off"}
          </button>
          <button
            type="button"
            onClick={onToggleResponders}
            aria-pressed={respondersNotified}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[11.5px] font-semibold transition",
              respondersNotified
                ? "border-success/25 bg-success/18 text-success"
                : "border-border/60 bg-secondary/40 text-muted-foreground",
            )}
          >
            <Users className="h-3.5 w-3.5 shrink-0" />
            {respondersNotified ? "Neighbors alerted" : "Neighbors not alerted"}
          </button>
        </div>
      </div>
    </div>
  );

  const StatusSection = (
    <div>
      <SectionLabel>
        <Radio className="mr-1.5 inline-block h-3 w-3 align-middle" />
        Live status
      </SectionLabel>
      <div className="grid grid-cols-2 gap-2">
        <StatusTile
          icon={MapPin}
          label="Location"
          value={
            locationShared && location
              ? `Shared · ±${Math.round(location.accuracy)} m`
              : "Not shared"
          }
          color="green"
          visible
        />
        <StatusTile
          icon={Shield}
          label="Police"
          value={calledTargets.includes("Police") ? "Call started" : "Ready to call"}
          color="blue"
          visible={
            status.police ||
            responsePlan.some(
              (target) => target.label === "Local authorities" || target.level === 4,
            )
          }
        />
        <StatusTile
          icon={Heart}
          label="Medical"
          value={calledTargets.includes("Ambulance") ? "Call started" : "Ready to call"}
          color="green"
          visible={status.hospital || emergencyType === "medical" || emergencyType === "accident"}
        />
        <StatusTile
          icon={Radio}
          label="Community"
          value={
            respondersNotified
              ? `${(COMMUNITY_RADIUS[emergencyType] ?? 1000) / 1000} km search`
              : "Not notified"
          }
          color="amber"
          visible={status.community || respondersNotified}
        />
      </div>
    </div>
  );

  const MapSection = location ? <LiveLocationMap location={location} /> : null;

  const RespondersSection = (
    <AnimatePresence>
      {responders.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          <SectionLabel>
            Community responders
            <span className="ml-2 rounded-full bg-gold/18 px-2 py-0.5 font-normal normal-case tracking-normal text-gold">
              {responders.length} nearby
            </span>
          </SectionLabel>
          <div className="space-y-2">
            {responders.map((r) => (
              <ResponderCard key={r.id} responder={r} />
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Opted-in responders only · Exact locations are never shared
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const EscalationSection = (
    <div className="rounded-2xl border border-gold/20 bg-gold/15 p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold/18">
          <Radio className="h-4 w-4 text-gold" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">
            AI escalation desk
          </p>
          <h3 className="mt-1 font-display text-[16px] font-bold text-foreground">
            Nearby help is ready to coordinate
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Allma ranks available, opted-in responders by distance, availability and verification.
            You choose who to contact.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/40 px-3 py-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gold/18 text-[11px] font-black text-gold">
            1
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-foreground">
              {nearestResponder?.name ?? "Verified responder search"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {nearestResponder
                ? `Approx. ${nearestResponder.distance} · ${nearestResponder.eta}`
                : "Only recently active, location-sharing responders are considered"}
            </p>
          </div>
          {nearestResponder?.verified && (
            <span className="rounded-full bg-info/18 px-2 py-1 text-[9px] font-bold uppercase text-info">
              Verified
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/40 px-3 py-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-info/18 text-[11px] font-black text-info">
            2
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-foreground">Official response chain</p>
            <p className="text-[10px] text-muted-foreground">
              {isViolentEmergency
                ? "Police and local authority priority"
                : "Local authority and emergency services"}
            </p>
          </div>
        </div>
      </div>

      {isViolentEmergency && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/18 px-3 py-2.5 text-[10px] leading-relaxed text-destructive/65">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <span>
            Safety priority: volunteers must not confront anyone. Move to a safe place and contact
            police or official emergency services.
          </span>
        </div>
      )}

      {escalationAction && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-success/20 bg-success/18 px-3 py-2.5 text-[11px] text-success">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
          {escalationAction === "community"
            ? "Nearby responder search is active. We will stop when someone accepts."
            : escalationAction === "nearest"
              ? "The nearest eligible responder has been requested."
              : escalationAction === "authority"
                ? "Local authority has been added to the response path."
                : escalationAction === "police"
                  ? "Police call opened. Share the location shown below with the operator."
                  : "Ambulance call opened. Keep the line clear for the operator."}
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => runEscalationAction("nearest")}
          disabled={!nearestResponder}
          className="flex items-center justify-center gap-2 rounded-xl border border-gold/25 bg-gold/10 px-3 py-3 text-[11px] font-bold text-gold transition hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Users className="h-3.5 w-3.5" /> Call nearest responder
        </button>
        <button
          type="button"
          onClick={() => runEscalationAction("community")}
          disabled={!respondersNotified}
          className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-secondary/40 px-3 py-3 text-[11px] font-bold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Radio className="h-3.5 w-3.5" /> Notify nearby responders
        </button>
        <button
          type="button"
          onClick={() => runEscalationAction("authority")}
          className="flex items-center justify-center gap-2 rounded-xl border border-info/20 bg-info/10 px-3 py-3 text-[11px] font-bold text-info transition hover:bg-info/20"
        >
          <Shield className="h-3.5 w-3.5" /> Contact local authority
        </button>
        <a
          href="tel:999"
          onClick={() => runEscalationAction("police")}
          className="flex items-center justify-center gap-2 rounded-xl border border-destructive/25 bg-destructive/15 px-3 py-3 text-[11px] font-bold text-destructive transition hover:bg-destructive/25"
        >
          <Phone className="h-3.5 w-3.5" /> Contact police · 999
        </a>
        <a
          href="tel:911"
          onClick={() => runEscalationAction("ambulance")}
          className="flex items-center justify-center gap-2 rounded-xl border border-success/20 bg-success/10 px-3 py-3 text-[11px] font-bold text-success transition hover:bg-success/20 sm:col-span-2"
        >
          <Heart className="h-3.5 w-3.5" /> Contact ambulance · 911
        </a>
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        Calls use your device dialer and always require your tap. Exact responder coordinates are
        never shown.
      </p>
    </div>
  );

  const FacilitiesSection = showPoliceFirst ? (
    <>
      <FacilitySection title="Officers on duty" demo facilities={officers} />
      {info.showHospitals && <FacilitySection title="Nearest hospitals" facilities={hospitals} />}
    </>
  ) : (
    <>
      {info.showHospitals && <FacilitySection title="Nearest hospitals" facilities={hospitals} />}
      <FacilitySection title="Officers on duty" demo facilities={officers} />
    </>
  );

  return (
    <motion.div
      className="flex min-h-0 flex-1 flex-col"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.32 }}
    >
      {/* ── Sticky header ── */}
      <div className="glass shrink-0 border-b border-border/60 px-3 py-2.5 sm:px-5 sm:py-3">
          <div className="mx-auto flex min-w-0 max-w-5xl items-center justify-between gap-1.5 sm:gap-3">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-destructive/18">
              <TypeIcon
                className={cn("h-4.5 w-4.5", typeInfo?.color ?? "text-destructive")}
                strokeWidth={1.5}
              />
              <span className="absolute -right-0.5 -top-0.5 grid h-3 w-3 place-items-center rounded-full border border-background bg-destructive">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-destructive-foreground" />
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-[14px] font-bold text-foreground">
                {typeInfo?.label ?? "Emergency"}{" "}
                <span className="ml-1 text-[11px] font-normal text-destructive">● LIVE</span>
              </p>
              {location && (
                <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                  <MapPin className="h-2.5 w-2.5 shrink-0" />
                  {[location.suburb, location.district].filter(Boolean).join(", ") ||
                    location.address}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={onReport}
              className="flex min-h-9 items-center gap-1 rounded-xl border border-border/70 bg-secondary px-2 py-1.5 text-[10px] font-bold text-foreground transition hover:border-primary/40 hover:bg-accent sm:gap-1.5 sm:px-3.5 sm:text-[12px]"
            >
              <Shield className="h-3.5 w-3.5 shrink-0" /> <span>Report</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-9 items-center gap-1 rounded-xl border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[10px] font-bold text-destructive transition hover:border-destructive/50 hover:bg-destructive/20 sm:gap-1.5 sm:px-3 sm:text-[11px]"
            >
              <X className="h-3.5 w-3.5 shrink-0" /> Close
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Mobile: single scrolling column with everything */}
        <div className="flex-1 overflow-y-auto lg:hidden">
          <div className="mx-auto w-full max-w-lg space-y-5 px-3 py-4 pb-[calc(4rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-5 sm:pb-16">
            {AiSection}
            {EscalationSection}
            {ResponsePlanSection}
            {CallSection}
            {TrustedContactsSection}
            {StepsSection}
            {StatusSection}
            {ControlsSection}

            {MapSection}
            {RespondersSection}
            {FacilitiesSection}
            {TimelineSection}

            <div className="space-y-2 pt-1">
              <button
                onClick={onReport}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-primary/35 bg-primary/10 py-3.5 text-[13px] font-bold text-foreground transition hover:border-primary/60 hover:bg-primary/15"
              >
                <Shield className="h-4 w-4" /> File an incident report
              </button>
              <button
                onClick={onClose}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-[12px] font-bold text-destructive transition hover:border-destructive/45 hover:bg-destructive/18"
              >
                <X className="h-3.5 w-3.5" /> I'm safe — close SOS
              </button>
            </div>
          </div>
        </div>

        {/* Desktop LEFT column — AI + steps + timeline */}
        <div className="hidden flex-1 overflow-y-auto lg:block">
          <div className="space-y-5 px-6 py-5 pb-14">
            {AiSection}
            {EscalationSection}
            {ResponsePlanSection}
            {StepsSection}
            {TimelineSection}
          </div>
        </div>

        {/* Desktop RIGHT column — call + status + map + responders + facilities */}
        <div className="hidden w-[360px] shrink-0 border-l border-border/60 lg:flex lg:flex-col">
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-5 p-5 pb-14">
              {CallSection}
              {TrustedContactsSection}
              {StatusSection}
              {ControlsSection}

              {MapSection}
              {RespondersSection}
              {FacilitiesSection}

              <div className="space-y-2 pt-1">
                <button
                  onClick={onClose}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-[12px] font-bold text-destructive transition hover:border-destructive/45 hover:bg-destructive/18"
                >
                  <X className="h-3.5 w-3.5" /> I'm safe — close SOS
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Report ───────────────────────────────────────────────────────────────────

function ReportScreen({
  reportText,
  setReportText,
  onSubmit,
  onBack,
  submitting,
}: {
  reportText: string;
  setReportText: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
}) {
  return (
    <motion.div
      className="flex h-full flex-col items-center overflow-y-auto px-5 pt-10 pb-10"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.28 }}
    >
      <div className="w-full max-w-lg">
        <button
          onClick={onBack}
          className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border/70 bg-secondary/70 px-3.5 text-[13px] font-semibold text-foreground transition hover:border-primary/40 hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h2 className="mb-1 font-display text-2xl font-black text-foreground">Quick incident report</h2>
        <p className="mb-7 text-[13px] text-muted-foreground">
          Takes 30 seconds. Helps responders understand the situation.
        </p>

        <div className="rounded-2xl border border-border/60 bg-secondary/40 p-5 lg:p-6">
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            What happened?
          </label>
          <textarea
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            placeholder="Briefly describe the situation — e.g. 'A man grabbed my bag near Shoprite and ran toward the market.'"
            rows={6}
            maxLength={2000}
            className="w-full resize-none rounded-xl border border-border/60 bg-secondary/40 px-4 py-3 text-[14px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-destructive/40"
          />
          <p className="mt-1.5 text-right text-[10px] text-muted-foreground">{reportText.length}/2000</p>
        </div>

        <button
          onClick={onSubmit}
          disabled={submitting}
          className="shadow-lift mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-destructive py-4 font-display text-[15px] font-bold text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          {submitting ? "Submitting…" : "Submit emergency report"}
        </button>
        <button
          onClick={onBack}
          className="mt-2.5 flex min-h-11 w-full items-center justify-center rounded-2xl border border-border/70 bg-secondary/70 py-3 text-[12px] font-bold text-foreground transition hover:border-primary/40 hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

// ─── Submitted ────────────────────────────────────────────────────────────────

function SubmittedScreen({ reference, onDone }: { reference: string | null; onDone: () => void }) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-6 text-center"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, type: "spring", stiffness: 260, damping: 20 }}
    >
      <motion.div
        className="mb-6 grid h-20 w-20 place-items-center rounded-full bg-success/20 ring-1 ring-success/30 ring-offset-4 ring-offset-background"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 20 }}
      >
        <CheckCircle2 className="h-10 w-10 text-success" />
      </motion.div>
      <motion.h2
        className="mb-2 font-display text-2xl font-black text-foreground"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
      >
        Report Submitted
      </motion.h2>
      {reference && (
        <motion.div
          className="mb-4 rounded-2xl border border-border/60 bg-secondary/40 px-6 py-3.5"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24 }}
        >
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Reference</p>
          <p className="mt-1 font-display text-2xl font-black tracking-wide text-gold">
            {reference}
          </p>
        </motion.div>
      )}
      <motion.p
        className="mb-10 max-w-sm text-[14px] leading-relaxed text-muted-foreground"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28 }}
      >
        The nearest response team has been notified. Stay safe and remain in a secure location.
      </motion.p>
      <motion.button
        onClick={onDone}
        className="flex min-h-12 items-center gap-2 rounded-2xl border border-primary/35 bg-primary/10 px-8 py-3.5 text-[14px] font-bold text-foreground transition hover:border-primary/60 hover:bg-primary/15"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32 }}
        whileTap={{ scale: 0.97 }}
      >
        Close SOS <ChevronRight className="h-4 w-4" />
      </motion.button>
    </motion.div>
  );
}
