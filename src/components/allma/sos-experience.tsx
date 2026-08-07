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
  Check,
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

// ─── Constants ────────────────────────────────────────────────────────────────

const EMERGENCY_NUMBERS = [
  {
    label: "Police",
    number: "999",
    gradient: "from-blue-700 to-blue-900",
    glow: "rgba(59,130,246,0.35)",
  },
  {
    label: "Ambulance",
    number: "911",
    gradient: "from-green-700 to-green-900",
    glow: "rgba(34,197,94,0.35)",
  },
  {
    label: "Fire Brigade",
    number: "112",
    gradient: "from-orange-600 to-red-900",
    glow: "rgba(234,88,12,0.35)",
  },
  {
    label: "General Emergency",
    number: "112",
    gradient: "from-zinc-700 to-zinc-900",
    glow: "rgba(161,161,170,0.18)",
  },
];

const EMERGENCY_TYPES = [
  { id: "crime", icon: Car, label: "Crime / Theft", color: "text-blue-400", bg: "bg-blue-950/50" },
  {
    id: "medical",
    icon: Heart,
    label: "Medical Emergency",
    color: "text-green-400",
    bg: "bg-green-950/50",
  },
  { id: "fire", icon: Zap, label: "Fire", color: "text-orange-400", bg: "bg-orange-950/50" },
  {
    id: "attack",
    icon: AlertTriangle,
    label: "Attack / Violence",
    color: "text-red-400",
    bg: "bg-red-950/50",
  },
  {
    id: "accident",
    icon: Car,
    label: "Road Accident",
    color: "text-amber-400",
    bg: "bg-amber-950/50",
  },
  {
    id: "missing",
    icon: UserX,
    label: "Missing Person",
    color: "text-purple-400",
    bg: "bg-purple-950/50",
  },
  {
    id: "domestic",
    icon: Home,
    label: "Domestic Violence",
    color: "text-pink-400",
    bg: "bg-pink-950/50",
  },
  {
    id: "other",
    icon: MoreHorizontal,
    label: "Other Emergency",
    color: "text-zinc-400",
    bg: "bg-zinc-800/50",
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
    <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/35">
      {children}
    </p>
  );
}

function AiChatBubble({ text, typing }: { text: string; typing?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-red-700 to-red-900 shadow-[0_0_14px_rgba(220,38,38,0.45)]">
        <Brain className="h-3.5 w-3.5 text-white" />
      </div>
      <div className="flex-1 rounded-2xl rounded-tl-sm border border-white/10 bg-white/6 px-4 py-3 text-[13px] leading-relaxed text-white/85 backdrop-blur-sm">
        {text}
        {typing && (
          <span className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 animate-pulse rounded-full bg-white/55" />
        )}
      </div>
    </div>
  );
}

const RESPONDER_STATUS_CHIP: Record<ResponderStatus, { label: string; cls: string }> = {
  offered: { label: "Offered", cls: "bg-white/8 text-white/45" },
  accepted: { label: "Accepted", cls: "bg-amber-900/60 text-amber-300" },
  declined: { label: "Declined", cls: "bg-red-950/60 text-red-300" },
  en_route: { label: "En Route", cls: "bg-blue-900/60 text-blue-300" },
  arrived: { label: "Arrived", cls: "bg-green-900/60 text-green-300" },
  cancelled: { label: "Cancelled", cls: "bg-white/8 text-white/35" },
};

function ResponderCard({ responder }: { responder: Responder }) {
  const chip = RESPONDER_STATUS_CHIP[responder.status];
  return (
    <motion.div
      layout
      className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/5 px-4 py-3 backdrop-blur-sm"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 22 }}
    >
      <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-white/15 to-white/5 text-sm font-bold text-white/70">
        {responder.name
          .split(" ")
          .map((p) => p[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()}
        {responder.verified && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-blue-500 text-[9px] font-black text-white">
            ✓
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[13px] font-semibold text-white/90">{responder.name}</p>
          {responder.verified && (
            <span className="rounded-full border border-blue-500/30 bg-blue-950/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-400">
              Verified
            </span>
          )}
        </div>
        <p className="text-[11px] text-white/38">
          {responder.distance} away · ETA {responder.eta}
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
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/5 px-3.5 py-3 backdrop-blur-sm">
      <div
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full",
          isHospital ? "bg-green-950/70" : "bg-blue-950/70",
        )}
      >
        {isHospital ? (
          <Building2 className="h-4 w-4 text-green-400" />
        ) : (
          <Shield className="h-4 w-4 text-blue-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-white/88">{facility.name}</p>
        <p className="flex items-center gap-1 text-[11px] text-white/38">
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{facility.address}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span
          className={cn(
            "text-[11px] font-semibold",
            isHospital ? "text-green-400/80" : "text-blue-400/80",
          )}
        >
          {facility.distance}
        </span>
        <a
          href={`tel:${facility.phone.replace(/\s/g, "")}`}
          className="flex items-center gap-1 rounded-lg bg-white/8 px-2.5 py-1 text-[10px] font-semibold text-white/65 transition hover:bg-white/14"
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
          <span className="ml-1.5 font-normal normal-case tracking-normal text-white/20">
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
    green: "border-green-500/20 bg-green-950/35 text-green-400",
    blue: "border-blue-500/20 bg-blue-950/35 text-blue-400",
    amber: "border-amber-500/20 bg-amber-950/35 text-amber-400",
    red: "border-red-500/20 bg-red-950/35 text-red-400",
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
    <div className="dark fixed inset-0 z-[100] overflow-hidden bg-[#060606]">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(185,20,20,0.25) 0%, transparent 60%), radial-gradient(ellipse 50% 35% at 85% 110%, rgba(255,185,0,0.07) 0%, transparent 55%)",
        }}
      />
      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.4) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.4) 1px,transparent 1px)",
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
      className="flex h-full flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.3 }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/6 px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-full bg-red-800/80">
            <Siren className="h-3.5 w-3.5 text-red-300" strokeWidth={1.5} />
          </div>
          <span className="text-[13px] font-semibold text-white/75">Allma Safety AI</span>
        </div>
        <span className="rounded-full border border-red-500/25 bg-red-950/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-red-400/80">
          Demo
        </span>
      </div>

      {/* Main area — side by side on desktop */}
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8 lg:flex-row lg:justify-center lg:gap-24 lg:py-0">
        {/* Left: button */}
        <div className="flex flex-col items-center text-center">
          <motion.p
            className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.28em] text-red-400/60"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Emergency Response
          </motion.p>
          <motion.h1
            className="mb-2 font-display text-[32px] font-black text-white"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
          >
            SOS
          </motion.h1>
          <motion.p
            className="mb-12 text-[13px] text-white/35"
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
            <span className="absolute inset-0 animate-ping rounded-full bg-red-600/15" />
            <span className="absolute -inset-6 animate-ping rounded-full bg-red-600/07 [animation-delay:0.6s]" />
            <button
              onClick={onActivate}
              aria-label="Activate Emergency SOS"
              className="relative h-52 w-52 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-4 focus-visible:ring-offset-[#060606]"
            >
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "conic-gradient(from 0deg, #dc2626, #fbbf24 38%, #dc2626 68%, #991b1b)",
                  padding: "3px",
                }}
              />
              <span className="absolute inset-[3px] rounded-full bg-[#060606]" />
              <span className="absolute inset-[14px] flex items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-900 shadow-[0_0_72px_rgba(220,38,38,0.6)]">
                <span className="font-display text-[28px] font-black tracking-[0.18em] text-white">
                  SOS
                </span>
              </span>
            </button>
          </motion.div>

          <motion.p
            className="mt-12 text-[11px] text-white/18"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            Demo · No real services contacted
          </motion.p>
        </div>

        {/* Right: info panel — stacked below the button on mobile */}
        <motion.div
          className="mb-10 mt-8 w-full max-w-sm space-y-3 lg:mb-0 lg:mt-10 lg:w-72 lg:max-w-none"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em] text-white/25">
            Emergency Numbers
          </p>
          {EMERGENCY_NUMBERS.map((e) => (
            <a
              key={e.label}
              href={`tel:${e.number}`}
              className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-3 transition hover:bg-white/8"
            >
              <div>
                <p className="text-[13px] font-semibold text-white/85">{e.label}</p>
                <p className="text-[11px] text-white/35">Tap to call</p>
              </div>
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-xl bg-gradient-to-br px-3 py-1.5 text-[15px] font-black text-white",
                  e.gradient,
                )}
                style={{ boxShadow: `0 0 16px ${e.glow}` }}
              >
                <Phone className="h-3 w-3" />
                {e.number}
              </div>
            </a>
          ))}
          <div className="rounded-2xl border border-white/6 bg-white/3 px-4 py-3 text-[12px] text-white/28 leading-relaxed">
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
      className="flex h-full flex-col overflow-y-auto"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25 }}
    >
      <div className="mx-auto w-full max-w-2xl px-5 pt-12 pb-10">
        <motion.div
          className="mb-7"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
        >
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.26em] text-red-400/60">
            Emergency SOS
          </p>
          <h2 className="font-display text-2xl font-black text-white">What's happening?</h2>
          <p className="mt-1 text-[13px] text-white/35">
            Select the emergency type. Help will be tailored instantly.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {EMERGENCY_TYPES.map((et, i) => {
            const Icon = et.icon;
            return (
              <motion.button
                key={et.id}
                onClick={() => onSelect(et.id)}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur-md transition-all hover:border-white/20 hover:bg-white/9 active:scale-95"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.07 + i * 0.03 }}
                whileTap={{ scale: 0.93 }}
              >
                <div className={cn("grid h-11 w-11 place-items-center rounded-2xl", et.bg)}>
                  <Icon className={cn("h-5 w-5", et.color)} strokeWidth={1.5} />
                </div>
                <span className="text-[13px] font-semibold leading-tight text-white/80 group-hover:text-white">
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
      className="flex h-full flex-col overflow-y-auto"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -18 }}
      transition={{ duration: 0.25 }}
    >
      <div className="mx-auto w-full max-w-xl px-5 py-10">
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-[13px] text-white/40 hover:text-white/70"
        >
          <ArrowLeft className="h-4 w-4" /> Change emergency type
        </button>
        <div className="mb-6 flex items-start gap-3">
          <div
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
              typeInfo?.bg ?? "bg-red-950/50",
            )}
          >
            <Icon className={cn("h-5 w-5", typeInfo?.color ?? "text-red-400")} />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-red-400/65">
              Before we coordinate help
            </p>
            <h2 className="mt-1 font-display text-2xl font-black text-white">
              {typeInfo?.label ?? "Emergency"}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-white/40">
              You stay in control of what Allma shares. Calls to official services always require
              your tap.
            </p>
          </div>
        </div>

        <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">
            Suggested response path
          </p>
          <div className="space-y-3">
            {plan.map((target) => (
              <div key={target.level} className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-black",
                    target.tone === "red"
                      ? "bg-red-900/70 text-red-300"
                      : target.tone === "blue"
                        ? "bg-blue-900/70 text-blue-300"
                        : target.tone === "amber"
                          ? "bg-amber-900/70 text-amber-300"
                          : "bg-violet-900/70 text-violet-300",
                  )}
                >
                  {target.level}
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-white/80">{target.label}</p>
                  <p className="text-[11px] text-white/35">{target.detail}</p>
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

        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-500/15 bg-amber-950/20 px-4 py-3 text-[11px] leading-relaxed text-amber-100/55">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/80" />
          <span>
            For immediate danger, call the official emergency number shown on the next screen. Allma
            is independent and is not an emergency service.
          </span>
        </div>

        <button
          onClick={onConfirm}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-700 py-4 font-display text-[15px] font-bold text-white shadow-[0_8px_26px_rgba(185,28,28,0.28)] transition hover:bg-red-600 active:scale-[0.99]"
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
        checked ? "border-green-500/25 bg-green-950/25" : "border-white/10 bg-white/4",
      )}
      aria-pressed={checked}
    >
      <div
        className={cn(
          "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl",
          checked ? "bg-green-900/70 text-green-300" : "bg-white/8 text-white/35",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-white/82">{title}</span>
        <span className="mt-1 block text-[11px] leading-relaxed text-white/35">{description}</span>
      </span>
      <span
        className={cn(
          "mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border",
          checked
            ? "border-green-400 bg-green-500 text-[#07120b]"
            : "border-white/20 text-transparent",
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
        <span className="absolute h-52 w-52 animate-ping rounded-full bg-red-600/7 [animation-duration:1.6s]" />
        <span className="absolute h-36 w-36 animate-ping rounded-full bg-red-600/11 [animation-duration:1.2s]" />
        <motion.div
          className="relative flex h-24 w-24 items-center justify-center rounded-full border border-red-700/40 bg-red-950/60 backdrop-blur-sm"
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 1.1, repeat: Infinity }}
        >
          <Siren className="h-11 w-11 text-red-400" strokeWidth={1.5} />
        </motion.div>
      </div>

      <motion.div
        className="mb-8 flex max-w-sm items-start gap-2.5 text-left"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-red-700 to-red-900">
          <Brain className="h-3.5 w-3.5 text-white" />
        </div>
        <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/6 px-4 py-3 text-[13px] leading-relaxed text-white/85">
          {aiText}
          {aiText.length < aiFull.length && (
            <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-white/60" />
          )}
        </div>
      </motion.div>

      <div className="w-full max-w-xs space-y-3">
        {steps.map((s, i) => (
          <motion.div
            key={i}
            className={cn(
              "flex items-center gap-3 text-[13px] transition-colors",
              i <= step ? "text-white/85" : "text-white/18",
            )}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            {i < step ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
            ) : i === step ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-400" />
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-full border border-white/15" />
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
  const responders: Responder[] = liveOffers.map((offer) => ({
    id: offer.offer_id,
    offerId: offer.offer_id,
    name: offer.display_name || "Nearby responder",
    distance: formatDistanceMeters(offer.distance_m),
    eta: "available",
    status: offer.status,
    verified: false,
  }));

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

  const mapUrl = location
    ? (() => {
        const delta = Math.max(0.004, Math.min(0.02, (location.accuracy / 111000) * 5));
        return `https://www.openstreetmap.org/export/embed.html?bbox=${location.lng - delta},${location.lat - delta},${location.lng + delta},${location.lat + delta}&layer=mapnik&marker=${location.lat},${location.lng}`;
      })()
    : null;

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
      className="rounded-2xl border border-red-900/30 bg-red-950/18 p-5"
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
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-red-700/80 text-[10px] font-black text-white">
              {i + 1}
            </span>
            <span className="text-[14px] leading-snug text-white/82">{step}</span>
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
                    ? "border-green-500 bg-green-950/60 text-green-400"
                    : "border-white/16 text-white/16",
                )}
              >
                {i < timelineDone ? "✓" : "·"}
              </div>
              {i < TIMELINE.length - 1 && (
                <div
                  className={cn(
                    "mt-1 w-px transition-all duration-700",
                    i < timelineDone ? "bg-green-500/30" : "bg-white/8",
                  )}
                  style={{ minHeight: 22 }}
                />
              )}
            </div>
            <div className="pb-4">
              <p
                className={cn(
                  "text-[13px] font-medium transition-colors duration-500",
                  i < timelineDone ? "text-white/82" : "text-white/20",
                )}
              >
                {ev.label}
              </p>
              {ev.sub && (
                <p
                  className={cn(
                    "text-[11px] transition-colors duration-500",
                    i < timelineDone ? "text-white/38" : "text-white/10",
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
            style={{ boxShadow: `0 4px 22px ${e.glow}` }}
          >
            <Phone className="h-4 w-4 text-white/75" />
            <span className="font-display text-[26px] font-black leading-none text-white">
              {e.number}
            </span>
            <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-white/65">
              {calledTargets.includes(e.label) ? "Call started" : e.label}
            </span>
          </a>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-white/25">
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
            className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-3.5 py-3"
          >
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-black",
                target.tone === "red"
                  ? "bg-red-900/70 text-red-300"
                  : target.tone === "blue"
                    ? "bg-blue-900/70 text-blue-300"
                    : target.tone === "amber"
                      ? "bg-amber-900/70 text-amber-300"
                      : "bg-violet-900/70 text-violet-300",
              )}
            >
              L{target.level}
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-white/75">{target.label}</p>
              <p className="text-[11px] leading-relaxed text-white/30">{target.detail}</p>
            </div>
            <span className="ml-auto shrink-0 rounded-full border border-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white/30">
              {target.level === 4
                ? "Tap to call"
                : target.level === 2 && respondersNotified
                  ? "Searching"
                  : "Ready"}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-white/22">
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
              className="flex items-center gap-3 rounded-xl border border-violet-500/15 bg-violet-950/20 px-3.5 py-3 transition hover:bg-violet-950/35"
            >
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-900/60 text-[11px] font-bold text-violet-200">
                {contact.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-white/75">{contact.name}</p>
                <p className="text-[10px] text-white/30">
                  {contact.relationship || "Trusted contact"} · {contact.phone}
                </p>
              </div>
              <span className="flex items-center gap-1 rounded-lg bg-violet-800/70 px-2.5 py-1.5 text-[10px] font-bold text-violet-100">
                <Phone className="h-3 w-3" />{" "}
                {calledTargets.includes(contact.id) ? "Called" : "Call"}
              </span>
            </a>
          ))}
        </div>
      </div>
    ) : null;

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

  const MapSection = mapUrl ? (
    <div className="overflow-hidden rounded-2xl border border-white/10">
      <div className="relative">
        <iframe
          src={mapUrl}
          title="Your live location"
          className="h-44 w-full"
          style={{ filter: "invert(0.88) hue-rotate(180deg)" }}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            <span className="absolute h-14 w-14 animate-ping rounded-full bg-red-500/18 [animation-duration:1.4s]" />
            <span className="absolute h-7 w-7 animate-ping rounded-full bg-red-500/28 [animation-duration:1s]" />
            <span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-red-500 shadow-[0_0_12px_rgba(220,38,38,0.8)]" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-white/5 px-4 py-2.5 text-[11px] text-white/45">
        <Navigation2 className="h-3 w-3 shrink-0 text-red-400" />
        <span className="min-w-0 truncate">
          {location?.address}
          {location?.district ? `, ${location.district}` : ""}
        </span>
        {location && (
          <span className="shrink-0 text-white/30">±{Math.round(location.accuracy)} m</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1 text-green-400/70">
          <LocateFixed className="h-3 w-3" /> GPS
        </span>
      </div>
    </div>
  ) : null;

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
            <span className="ml-2 rounded-full bg-amber-900/50 px-2 py-0.5 font-normal normal-case tracking-normal text-amber-400">
              {responders.length} nearby
            </span>
          </SectionLabel>
          <div className="space-y-2">
            {responders.map((r) => (
              <ResponderCard key={r.id} responder={r} />
            ))}
          </div>
          <p className="mt-2 text-[10px] text-white/20">
            Opted-in responders only · Exact locations are never shared
          </p>
        </motion.div>
      )}
    </AnimatePresence>
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
      className="flex h-full flex-col"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.32 }}
    >
      {/* ── Sticky header ── */}
      <div className="shrink-0 border-b border-white/10 bg-[#080808]/92 px-5 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-800/80">
              <TypeIcon
                className={cn("h-4.5 w-4.5", typeInfo?.color ?? "text-red-300")}
                strokeWidth={1.5}
              />
              <span className="absolute -right-0.5 -top-0.5 grid h-3 w-3 place-items-center rounded-full border border-[#080808] bg-red-500">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-red-300" />
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-[14px] font-bold text-white">
                {typeInfo?.label ?? "Emergency"}{" "}
                <span className="ml-1 text-[11px] font-normal text-red-400">● LIVE</span>
              </p>
              {location && (
                <p className="flex items-center gap-1 truncate text-[11px] text-white/38">
                  <MapPin className="h-2.5 w-2.5 shrink-0" />
                  {[location.suburb, location.district].filter(Boolean).join(", ") ||
                    location.address}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={onReport}
              className="hidden items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-1.5 text-[12px] text-white/50 transition hover:border-white/20 hover:text-white/75 sm:flex"
            >
              <Shield className="h-3.5 w-3.5" /> File Report
            </button>
            <button
              onClick={onClose}
              className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-white/38 transition hover:border-white/22 hover:text-white/65"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Mobile: single scrolling column with everything */}
        <div className="flex-1 overflow-y-auto lg:hidden">
          <div className="mx-auto max-w-lg space-y-5 px-5 py-5 pb-16">
            {AiSection}
            {ResponsePlanSection}
            {CallSection}
            {TrustedContactsSection}
            {StepsSection}
            {StatusSection}
            {MapSection}
            {RespondersSection}
            {FacilitiesSection}
            {TimelineSection}

            <div className="space-y-2 pt-1">
              <button
                onClick={onReport}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-white/12 py-3.5 text-[13px] font-medium text-white/55 transition hover:border-white/22 hover:text-white/78"
              >
                <Shield className="h-4 w-4" /> File an incident report
              </button>
              <button
                onClick={onClose}
                className="w-full py-2.5 text-[11px] text-white/20 hover:text-white/40"
              >
                I'm safe — close SOS
              </button>
            </div>
          </div>
        </div>

        {/* Desktop LEFT column — AI + steps + timeline */}
        <div className="hidden flex-1 overflow-y-auto lg:block">
          <div className="space-y-5 px-6 py-5 pb-14">
            {AiSection}
            {ResponsePlanSection}
            {StepsSection}
            {TimelineSection}
          </div>
        </div>

        {/* Desktop RIGHT column — call + status + map + responders + facilities */}
        <div className="hidden w-[360px] shrink-0 border-l border-white/8 lg:flex lg:flex-col">
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-5 p-5 pb-14">
              {CallSection}
              {TrustedContactsSection}
              {StatusSection}
              {MapSection}
              {RespondersSection}
              {FacilitiesSection}

              <div className="space-y-2 pt-1">
                <button
                  onClick={onClose}
                  className="w-full py-2.5 text-center text-[11px] text-white/22 hover:text-white/42"
                >
                  I'm safe — close SOS
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
          className="mb-5 flex items-center gap-1.5 text-[13px] text-white/38 hover:text-white/62"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h2 className="mb-1 font-display text-2xl font-black text-white">Quick incident report</h2>
        <p className="mb-7 text-[13px] text-white/38">
          Takes 30 seconds. Helps responders understand the situation.
        </p>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 lg:p-6">
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">
            What happened?
          </label>
          <textarea
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            placeholder="Briefly describe the situation — e.g. 'A man grabbed my bag near Shoprite and ran toward the market.'"
            rows={6}
            maxLength={2000}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[14px] leading-relaxed text-white outline-none placeholder:text-white/22 focus:border-red-600/50"
          />
          <p className="mt-1.5 text-right text-[10px] text-white/22">{reportText.length}/2000</p>
        </div>

        <button
          onClick={onSubmit}
          disabled={submitting}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-700 py-4 font-display text-[15px] font-bold text-white transition hover:bg-red-600 disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          {submitting ? "Submitting…" : "Submit emergency report"}
        </button>
        <button
          onClick={onBack}
          className="mt-2.5 w-full py-3 text-[12px] text-white/22 hover:text-white/42"
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
        className="mb-6 grid h-20 w-20 place-items-center rounded-full bg-green-950/60 ring-1 ring-green-500/20 ring-offset-4 ring-offset-[#060606]"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 20 }}
      >
        <CheckCircle2 className="h-10 w-10 text-green-400" />
      </motion.div>
      <motion.h2
        className="mb-2 font-display text-2xl font-black text-white"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
      >
        Report Submitted
      </motion.h2>
      {reference && (
        <motion.div
          className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-6 py-3.5"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24 }}
        >
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/30">Reference</p>
          <p className="mt-1 font-display text-2xl font-black tracking-wide text-amber-400">
            {reference}
          </p>
        </motion.div>
      )}
      <motion.p
        className="mb-10 max-w-sm text-[14px] leading-relaxed text-white/45"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28 }}
      >
        The nearest response team has been notified. Stay safe and remain in a secure location.
      </motion.p>
      <motion.button
        onClick={onDone}
        className="flex items-center gap-2 rounded-2xl bg-white/10 px-8 py-3.5 text-[14px] font-medium text-white/75 transition hover:bg-white/15"
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
