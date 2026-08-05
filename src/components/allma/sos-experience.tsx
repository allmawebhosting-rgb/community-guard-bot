import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Siren, MapPin, Phone, Building2, Shield,
  Loader2, ChevronRight, Send, ArrowLeft,
  CheckCircle2, Navigation2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "idle" | "type-select" | "loading" | "help" | "report" | "submitted";

type LocationInfo = {
  address: string;
  suburb: string;
  district: string;
  lat: number;
  lng: number;
};

type Facility = {
  name: string;
  type: "hospital" | "police";
  distance: string;   // e.g. "1.2 km"
  phone: string;
  address: string;
};

type ResponderStatus = "notified" | "accepted" | "travelling" | "arrived" | "completed";

type Responder = {
  id: string;
  name: string;
  distance: string;
  eta: string;
  status: ResponderStatus;
  verified: boolean;
};

// ─── Emergency numbers ────────────────────────────────────────────────────────

const EMERGENCY_NUMBERS = [
  { label: "Police",            number: "999", color: "from-blue-700 to-blue-800",   glow: "rgba(59,130,246,0.35)" },
  { label: "Ambulance",         number: "911", color: "from-green-700 to-green-800", glow: "rgba(34,197,94,0.35)"  },
  { label: "Fire Brigade",      number: "112", color: "from-orange-700 to-red-800",  glow: "rgba(234,88,12,0.35)"  },
  { label: "General Emergency", number: "112", color: "from-gray-700 to-gray-800",   glow: "rgba(156,163,175,0.2)" },
];

const EMERGENCY_TYPES = [
  { id: "crime",    icon: "🚔", label: "Crime / Theft" },
  { id: "medical",  icon: "🚑", label: "Medical Emergency" },
  { id: "fire",     icon: "🔥", label: "Fire" },
  { id: "attack",   icon: "⚔️",  label: "Attack / Violence" },
  { id: "accident", icon: "🚗", label: "Road Accident" },
  { id: "missing",  icon: "👤", label: "Missing Person" },
  { id: "domestic", icon: "🏠", label: "Domestic Violence" },
  { id: "other",    icon: "⚡", label: "Other Emergency" },
];

// Demo community responders — simulate nearby Allma Safety AI users
const DEMO_RESPONDERS: Omit<Responder, "status">[] = [
  { id: "r1", name: "Kato M.",   distance: "0.4 km", eta: "~4 min",  verified: true  },
  { id: "r2", name: "Amara J.",  distance: "0.8 km", eta: "~8 min",  verified: false },
];

// Community search radius by emergency type (metres)
const COMMUNITY_RADIUS: Record<string, number> = {
  medical: 500, accident: 1000, fire: 2000, missing: 5000,
};

function getAiMessages(type: string, location: LocationInfo | null): string[] {
  const loc = location
    ? location.district || location.suburb || "your area"
    : "your area";
  const typeMsg: Record<string, string> = {
    crime:    `Police have been notified. Stay out of sight if possible — officers are being dispatched to your location right now.`,
    medical:  `An ambulance is being dispatched. Keep the patient still and calm. I've found the nearest hospitals and marked them on your map.`,
    fire:     `The fire brigade and ambulance have been alerted. Evacuate immediately — stay low and use stairs, never lifts.`,
    attack:   `Police are responding now. Move to a locked, safe location if you can. Stay quiet and keep your phone on silent.`,
    accident: `Ambulance and police have been dispatched. Do not move injured persons unless there is immediate danger.`,
    missing:  `Police have been notified. I'm expanding the community search radius to help locate the missing person.`,
    domestic: `Police are responding. If safe to do so, leave the premises and move to a neighbour or public space.`,
    other:    `Emergency services have been contacted. Stay calm and remain in a safe location if possible.`,
  };
  return [
    `Emergency mode activated. I'm locating you and determining the fastest available assistance.`,
    `Your location has been detected in ${loc}. I'm alerting the nearest emergency services now.`,
    typeMsg[type] ?? typeMsg.other,
    `I've found nearby Allma Safety AI community members. I'm alerting opted-in users within ${(COMMUNITY_RADIUS[type] ?? 1000) / 1000} km of your location.`,
    `A community responder nearby has accepted your emergency alert. Help is on the way — stay where you are if it is safe.`,
  ];
}

// ─── Demo fallback facilities ─────────────────────────────────────────────────
// Real Kampala coordinates — distances are computed at runtime from user location.

const DEMO_HOSPITALS: Omit<Facility, "distance">[] = [
  { name: "Mulago National Referral Hospital", type: "hospital", phone: "+256 414 541 188", address: "Mulago Hill Road, Kampala" },
  { name: "International Hospital Kampala",    type: "hospital", phone: "+256 312 200 400", address: "Plot 4686, Namuwongo, Kampala" },
  { name: "Nsambya Hospital",                  type: "hospital", phone: "+256 414 268 614", address: "Nsambya, Kampala" },
  { name: "Case Clinic Kampala",               type: "hospital", phone: "+256 312 200 150", address: "Plot 1, Mackinnon Road, Kampala" },
];

const DEMO_OFFICERS: Omit<Facility, "distance">[] = [
  { name: "Inspector Sarah N. — Available",   type: "police", phone: "+256 774 620 951", address: "Central Police Station, Kampala" },
  { name: "Sergeant David K. — Patrolling",   type: "police", phone: "+256 774 620 951", address: "East Division, Kampala" },
  { name: "Corporal Grace A. — Available",    type: "police", phone: "+256 774 620 951", address: "North Patrol Unit, Kampala" },
];

// ─── Haversine distance ───────────────────────────────────────────────────────

// Approximate lat/lng for demo facilities
const DEMO_COORDS: Record<string, [number, number]> = {
  "Mulago National Referral Hospital": [0.3374, 32.5760],
  "International Hospital Kampala":    [0.3004, 32.6137],
  "Nsambya Hospital":                  [0.2999, 32.5908],
  "Case Clinic Kampala":               [0.3190, 32.5861],
  "Inspector Sarah N. — Available":   [0.3144, 32.5797],
  "Sergeant David K. — Patrolling":   [0.3211, 32.5910],
  "Corporal Grace A. — Available":    [0.3402, 32.5662],
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function withDistance(
  items: Omit<Facility, "distance">[],
  lat: number,
  lng: number,
): Facility[] {
  return items
    .map((f) => {
      const coords = DEMO_COORDS[f.name];
      const km = coords ? haversineKm(lat, lng, coords[0], coords[1]) : null;
      const distance = km != null ? (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`) : "Nearby";
      return { ...f, distance };
    })
    .sort((a, b) => {
      const parse = (d: string) => parseFloat(d.replace(/[^\d.]/g, "")) * (d.includes("km") ? 1000 : 1);
      return parse(a.distance) - parse(b.distance);
    });
}

// ─── Overpass API fetch ───────────────────────────────────────────────────────

async function fetchOverpass(
  lat: number,
  lng: number,
  amenity: "hospital" | "police",
): Promise<Facility[]> {
  const r = 8000; // 8 km radius
  const query = `[out:json][timeout:5];(node[amenity=${amenity}](around:${r},${lat},${lng});way[amenity=${amenity}](around:${r},${lat},${lng}););out center 4;`;
  const res = await fetch(
    `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
  );
  const data = await res.json();
  const items: Facility[] = (data.elements || []).map((el: Record<string, unknown>) => {
    const tags = (el.tags || {}) as Record<string, string>;
    const elLat = typeof el.lat === "number" ? el.lat : (el.center as Record<string, number>)?.lat ?? lat;
    const elLng = typeof el.lon === "number" ? el.lon : (el.center as Record<string, number>)?.lon ?? lng;
    const km = haversineKm(lat, lng, elLat, elLng);
    return {
      name: tags.name || (amenity === "hospital" ? "Hospital" : "Police Station"),
      type: amenity,
      phone: tags.phone || tags["contact:phone"] || (amenity === "hospital" ? "911" : "999"),
      address: tags["addr:street"] ? `${tags["addr:housenumber"] || ""} ${tags["addr:street"]}`.trim() : "Nearby",
      distance: km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`,
    };
  });
  return items.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
}

// ─── Main component ────────────────────────────────────────────────────────────

export function SOSExperience() {
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>("idle");
  const [emergencyType, setEmergencyType] = useState("other");
  const [location, setLocation] = useState<LocationInfo | null>(null);
  const [hospitals, setHospitals] = useState<Facility[]>([]);
  const [officers, setOfficers] = useState<Facility[]>([]);
  const [reportText, setReportText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const activated = useRef(false);

  // Step 1: tap SOS → go straight to type selection
  function handleSosPress() {
    setPhase("type-select");
  }

  // Step 2: type chosen → start loading location + facilities
  async function handleTypeSelect(type: string) {
    if (activated.current) return;
    activated.current = true;
    setEmergencyType(type);
    setPhase("loading");

    // Get location
    let loc: LocationInfo | null = null;
    try { loc = await getLocation(); } catch { loc = null; }

    const finalLoc: LocationInfo = loc ?? {
      address: "Kampala Road", suburb: "Nakasero",
      district: "Kampala Central", lat: 0.3476, lng: 32.5825,
    };
    setLocation(finalLoc);

    // Fetch nearby facilities in parallel, with demo fallback
    const [realHospitals, realPolice] = await Promise.all([
      fetchOverpass(finalLoc.lat, finalLoc.lng, "hospital").catch(() => [] as Facility[]),
      fetchOverpass(finalLoc.lat, finalLoc.lng, "police").catch(() => [] as Facility[]),
    ]);

    setHospitals(
      realHospitals.length >= 2
        ? realHospitals.slice(0, 4)
        : withDistance(DEMO_HOSPITALS, finalLoc.lat, finalLoc.lng),
    );
    setOfficers(
      realPolice.length >= 1
        ? realPolice.slice(0, 3)
        : withDistance(DEMO_OFFICERS, finalLoc.lat, finalLoc.lng),
    );

    setPhase("help");
  }

  async function handleSubmitReport() {
    setSubmitting(true);
    const ref = `ASA-2026-${String(Math.floor(Math.random() * 900000 + 100000))}`;
    if (user && location) {
      await supabase.from("reports").insert({
        user_id: user.id,
        report_type: "emergency",
        category: "sos",
        title: "Emergency SOS",
        summary: reportText || "Emergency SOS submitted.",
        narrative: reportText,
        risk_level: "critical",
        latitude: location.lat,
        longitude: location.lng,
        location_text: `${location.address}, ${location.district}`,
      });
    }
    setReference(ref);
    setSubmitting(false);
    setPhase("submitted");
  }

  return (
    <div className="dark fixed inset-0 z-[100] overflow-hidden bg-[#070707]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 55% at 50% -15%, rgba(185,20,20,0.22) 0%, transparent 62%), radial-gradient(ellipse 55% 38% at 82% 108%, rgba(255,185,0,0.08) 0%, transparent 55%)",
        }}
      />
      <AnimatePresence mode="wait">
        {phase === "idle"        && <IdleScreen        key="idle"        onActivate={handleSosPress} />}
        {phase === "type-select" && <TypeSelectScreen  key="type-select" onSelect={handleTypeSelect} />}
        {phase === "loading"     && <LoadingScreen     key="loading"     />}
        {phase === "help"        && (
          <HelpScreen
            key="help"
            emergencyType={emergencyType}
            location={location}
            hospitals={hospitals}
            officers={officers}
            onReport={() => setPhase("report")}
            onClose={() => { activated.current = false; setPhase("idle"); }}
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
            onDone={() => { activated.current = false; setPhase("idle"); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── getLocation ──────────────────────────────────────────────────────────────

function getLocation(): Promise<LocationInfo> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) { reject(new Error("no geo")); return; }
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords;
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
          });
        } catch {
          resolve({ address: "Current Location", suburb: "", district: "", lat, lng });
        }
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 9000 },
    );
  });
}

// ─── Idle ─────────────────────────────────────────────────────────────────────

function IdleScreen({ onActivate }: { onActivate: () => void }) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-6 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
    >
      <motion.p
        className="mb-2 text-[11px] font-bold uppercase tracking-[0.25em] text-red-500/70"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        Allma Safety AI · Demo Mode
      </motion.p>
      <motion.h1
        className="mb-2 font-display text-3xl font-black text-white"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14 }}
      >
        Emergency SOS
      </motion.h1>
      <motion.p
        className="mb-14 text-[13px] text-white/38"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        Tap once for immediate help
      </motion.p>

      {/* Button */}
      <motion.div
        className="relative"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.22, type: "spring", stiffness: 240, damping: 18 }}
      >
        {/* Pulse rings */}
        <span className="absolute inset-0 animate-ping rounded-full bg-red-600/16" />
        <span className="absolute -inset-5 animate-ping rounded-full bg-red-600/08 [animation-delay:0.5s]" />

        <button
          onClick={onActivate}
          aria-label="Activate Emergency SOS"
          className="relative h-52 w-52 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-4 focus-visible:ring-offset-[#070707]"
        >
          {/* Conic ring */}
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: "conic-gradient(from 0deg, #dc2626, #fbbf24 38%, #dc2626 68%, #991b1b)",
              padding: "3px",
            }}
          />
          <span className="absolute inset-[3px] rounded-full bg-[#070707]" />
          {/* Core */}
          <span className="absolute inset-[14px] flex items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-red-900 shadow-[0_0_64px_rgba(220,38,38,0.55)]">
            <span className="font-display text-[28px] font-black tracking-[0.18em] text-white">SOS</span>
          </span>
        </button>
      </motion.div>

      <motion.p
        className="mt-14 text-[11px] text-white/22"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        Demo · No real emergency services contacted
      </motion.p>
    </motion.div>
  );
}

// ─── Type Select ─────────────────────────────────────────────────────────────

function TypeSelectScreen({ onSelect }: { onSelect: (t: string) => void }) {
  return (
    <motion.div
      className="flex h-full flex-col overflow-y-auto px-5 pt-12 pb-10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.28 }}
    >
      <div className="mx-auto w-full max-w-sm">
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
        >
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.24em] text-red-500/70">
            Emergency SOS
          </p>
          <h2 className="font-display text-2xl font-black text-white">
            What's happening?
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 gap-3">
          {EMERGENCY_TYPES.map((et, i) => (
            <motion.button
              key={et.id}
              onClick={() => onSelect(et.id)}
              className="group flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur-md transition-all hover:border-red-700/60 hover:bg-red-950/40 active:scale-95"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.04 }}
              whileTap={{ scale: 0.94 }}
            >
              <span className="text-4xl">{et.icon}</span>
              <span className="text-[13px] font-semibold leading-tight text-white/85 group-hover:text-white">
                {et.label}
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────

function LoadingScreen() {
  const steps = [
    "Activating emergency mode…",
    "Detecting precise GPS location…",
    "Alerting nearest emergency services…",
    "Searching for community responders…",
  ];
  const [step, setStep] = useState(0);
  const [aiText, setAiText] = useState("");
  const aiFull = "Emergency mode activated. I'm locating you and determining the fastest available assistance.";

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 900);
    const t2 = setTimeout(() => setStep(2), 2200);
    const t3 = setTimeout(() => setStep(3), 3400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // Typewriter for AI message
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setAiText(aiFull.slice(0, i));
      if (i >= aiFull.length) clearInterval(timer);
    }, 22);
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
      {/* GPS Pulse rings */}
      <div className="relative mb-10 flex items-center justify-center">
        <span className="absolute h-52 w-52 animate-ping rounded-full bg-red-600/8 [animation-duration:1.6s]" />
        <span className="absolute h-36 w-36 animate-ping rounded-full bg-red-600/12 [animation-duration:1.2s]" />
        <motion.div
          className="relative flex h-24 w-24 items-center justify-center rounded-full border border-red-700/40 bg-red-950/60 backdrop-blur-sm"
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 1.1, repeat: Infinity }}
        >
          <Siren className="h-12 w-12 text-red-400" strokeWidth={1.5} />
        </motion.div>
      </div>

      {/* AI bubble */}
      <motion.div
        className="mb-8 flex max-w-xs items-start gap-2.5 text-left"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-700 to-red-900 text-[12px]">
          🤖
        </div>
        <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/6 px-4 py-3 text-[13px] leading-relaxed text-white/85">
          {aiText}
          {aiText.length < aiFull.length && (
            <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-white/60" />
          )}
        </div>
      </motion.div>

      {/* Step list */}
      <div className="w-full max-w-xs space-y-3">
        {steps.map((s, i) => (
          <motion.div
            key={i}
            className={`flex items-center gap-3 text-[13px] transition-colors ${i <= step ? "text-white/85" : "text-white/18"}`}
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

// ─── useAiChat hook ───────────────────────────────────────────────────────────

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
        timer = setTimeout(tick, 14 + Math.random() * 12);
      } else {
        const done = msg;
        setLog((prev) => [...prev, done]);
        setTyping("");
        msgIdx.current++;
        charIdx.current = 0;
        if (msgIdx.current < msgs.current.length) {
          timer = setTimeout(tick, 2400);
        }
      }
    }
    timer = setTimeout(tick, 500);
    return () => clearTimeout(timer);
  }, []);

  return { log, typing };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AiChatBubble({ text, typing }: { text: string; typing?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-700 to-red-900 text-[12px] shadow-[0_0_12px_rgba(220,38,38,0.4)]">
        🤖
      </div>
      <div className="flex-1 rounded-2xl rounded-tl-sm border border-white/10 bg-white/6 px-4 py-3 text-[13px] leading-relaxed text-white/88 backdrop-blur-sm">
        {text}
        {typing && <span className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 animate-pulse rounded-full bg-white/55" />}
      </div>
    </div>
  );
}

const STATUS_CHIP: Record<ResponderStatus, { label: string; cls: string }> = {
  notified:   { label: "Notified",  cls: "bg-white/8 text-white/45" },
  accepted:   { label: "Accepted",  cls: "bg-amber-900/50 text-amber-300" },
  travelling: { label: "En Route",  cls: "bg-blue-900/50 text-blue-300"  },
  arrived:    { label: "Arrived",   cls: "bg-green-900/50 text-green-300" },
  completed:  { label: "Completed", cls: "bg-green-900/50 text-green-400" },
};

function ResponderCard({ responder }: { responder: Responder }) {
  const chip = STATUS_CHIP[responder.status];
  return (
    <motion.div
      layout
      className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/5 px-4 py-3 backdrop-blur-sm"
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 22 }}
    >
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg">
        🚑
        {responder.verified && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-black text-white">
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
          className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${chip.cls}`}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={{ duration: 0.2 }}
        >
          {chip.label}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}

function StatusTile({
  icon, label, value, color, visible,
}: {
  icon: string; label: string; value: string;
  color: "green" | "blue" | "amber" | "red";
  visible: boolean;
}) {
  const cls = {
    green: "border-green-500/20 bg-green-950/35 text-green-400",
    blue:  "border-blue-500/20 bg-blue-950/35 text-blue-400",
    amber: "border-amber-500/20 bg-amber-950/35 text-amber-400",
    red:   "border-red-500/20 bg-red-950/35 text-red-400",
  }[color];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={`flex flex-col gap-1 rounded-xl border p-3.5 ${cls}`}
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
        >
          <span className="text-xl">{icon}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-55">{label}</span>
          <span className="text-[12px] font-semibold leading-tight">{value}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TimelineDot({ done, last }: { done: boolean; last?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] transition-all duration-500 ${
          done
            ? "border-green-500 bg-green-950/60 text-green-400"
            : "border-white/18 text-white/18"
        }`}
      >
        {done ? "✓" : "·"}
      </div>
      {!last && (
        <div
          className={`mt-1 w-px transition-all duration-700 ${done ? "bg-green-500/30" : "bg-white/8"}`}
          style={{ minHeight: 20 }}
        />
      )}
    </div>
  );
}

// ─── Help ─────────────────────────────────────────────────────────────────────

const HELP_INFO: Record<string, { steps: string[]; primaryCalls: typeof EMERGENCY_NUMBERS; showHospitals: boolean }> = {
  crime: {
    steps: ["Move to a safe location away from the suspect immediately.", "Do not confront or chase — your safety first.", "Note the suspect's appearance, direction, or vehicle if safe."],
    primaryCalls: [
      { label: "Police",            number: "999", color: "from-blue-700 to-blue-800",   glow: "rgba(59,130,246,0.35)" },
      { label: "General Emergency", number: "112", color: "from-gray-700 to-gray-800",   glow: "rgba(156,163,175,0.2)" },
    ],
    showHospitals: false,
  },
  medical: {
    steps: ["Keep the person still and calm — do not move them unless in danger.", "Check if they are breathing. Start CPR if trained and they are not.", "Do not give food, water, or medication unless instructed by a dispatcher."],
    primaryCalls: [
      { label: "Ambulance",         number: "911", color: "from-green-700 to-green-800", glow: "rgba(34,197,94,0.35)"  },
      { label: "General Emergency", number: "112", color: "from-gray-700 to-gray-800",   glow: "rgba(156,163,175,0.2)" },
    ],
    showHospitals: true,
  },
  fire: {
    steps: ["Evacuate everyone immediately — do not attempt to fight the fire yourself.", "Stay low under smoke and use stairs, never lifts.", "Once outside move far away and do not re-enter for any reason."],
    primaryCalls: [
      { label: "Fire Brigade",      number: "112", color: "from-orange-700 to-red-800",  glow: "rgba(234,88,12,0.35)"  },
      { label: "Ambulance",         number: "911", color: "from-green-700 to-green-800", glow: "rgba(34,197,94,0.35)"  },
    ],
    showHospitals: true,
  },
  attack: {
    steps: ["Get to a safe locked location immediately and stay quiet.", "Keep your phone on silent and stay on the line with police.", "Do not try to negotiate — wait for officers to arrive."],
    primaryCalls: [
      { label: "Police",            number: "999", color: "from-blue-700 to-blue-800",   glow: "rgba(59,130,246,0.35)" },
      { label: "General Emergency", number: "112", color: "from-gray-700 to-gray-800",   glow: "rgba(156,163,175,0.2)" },
    ],
    showHospitals: false,
  },
  accident: {
    steps: ["Turn on hazard lights and move vehicles off the road if it is safe to do so.", "Do not move injured persons unless there is immediate danger.", "Keep bystanders away and secure the scene until help arrives."],
    primaryCalls: [
      { label: "Ambulance",         number: "911", color: "from-green-700 to-green-800", glow: "rgba(34,197,94,0.35)"  },
      { label: "Police",            number: "999", color: "from-blue-700 to-blue-800",   glow: "rgba(59,130,246,0.35)" },
    ],
    showHospitals: true,
  },
  missing: {
    steps: ["Check the immediate area and all places the person usually visits.", "Gather a recent photo and clothing description before calling police.", "Report immediately — there is no minimum wait time for missing persons."],
    primaryCalls: [
      { label: "Police",            number: "999", color: "from-blue-700 to-blue-800",   glow: "rgba(59,130,246,0.35)" },
      { label: "General Emergency", number: "112", color: "from-gray-700 to-gray-800",   glow: "rgba(156,163,175,0.2)" },
    ],
    showHospitals: false,
  },
  domestic: {
    steps: ["Leave the house and go to a neighbour or public place if you can.", "Take children with you if possible — your safety is the priority.", "Do not try to reason or negotiate with the aggressor."],
    primaryCalls: [
      { label: "Police",            number: "999", color: "from-blue-700 to-blue-800",   glow: "rgba(59,130,246,0.35)" },
      { label: "General Emergency", number: "112", color: "from-gray-700 to-gray-800",   glow: "rgba(156,163,175,0.2)" },
    ],
    showHospitals: false,
  },
  other: {
    steps: ["Stay calm and move to a safe location if needed.", "Call the appropriate emergency service below.", "Stay on the line and follow the dispatcher's instructions."],
    primaryCalls: [
      { label: "General Emergency", number: "112", color: "from-gray-700 to-gray-800",   glow: "rgba(156,163,175,0.2)" },
      { label: "Police",            number: "999", color: "from-blue-700 to-blue-800",   glow: "rgba(59,130,246,0.35)" },
      { label: "Ambulance",         number: "911", color: "from-green-700 to-green-800", glow: "rgba(34,197,94,0.35)"  },
    ],
    showHospitals: true,
  },
};

function HelpScreen({
  emergencyType,
  location,
  hospitals,
  officers,
  onReport,
  onClose,
}: {
  emergencyType: string;
  location: LocationInfo | null;
  hospitals: Facility[];
  officers: Facility[];
  onReport: () => void;
  onClose: () => void;
}) {
  const info = HELP_INFO[emergencyType] ?? HELP_INFO.other;
  const typeInfo = EMERGENCY_TYPES.find((t) => t.id === emergencyType);
  const showPoliceFirst = ["crime", "attack", "domestic", "missing"].includes(emergencyType);

  // AI streaming chat
  const aiMessages = useRef(getAiMessages(emergencyType, location)).current;
  const { log: aiLog, typing: aiTyping } = useAiChat(aiMessages);

  // Status tiles — appear progressively
  const [status, setStatus] = useState({ police: false, hospital: false, community: false });

  // Community responders — simulate opt-in users being found and responding
  const [responders, setResponders] = useState<Responder[]>([]);

  // Timeline — events tick in
  const TIMELINE = [
    { label: "SOS Activated",              sub: "Emergency mode engaged"                                    },
    { label: "Location Detected",          sub: [location?.suburb, location?.district].filter(Boolean).join(", ") || "Kampala" },
    { label: "Emergency Services Alerted", sub: "Police · Ambulance · Fire Brigade"                        },
    { label: "Community Search Started",   sub: `${(COMMUNITY_RADIUS[emergencyType] ?? 1000) / 1000} km radius · 6 users notified` },
    { label: "Community Responder Found",  sub: "Volunteer en route to your location"                      },
  ];
  const [timelineDone, setTimelineDone] = useState(2); // SOS + location already done

  useEffect(() => {
    const ts: ReturnType<typeof setTimeout>[] = [];
    const add = (ms: number, fn: () => void) => ts.push(setTimeout(fn, ms));

    add(1200, () => setStatus((s) => ({ ...s, police: true })));
    add(2200, () => setStatus((s) => ({ ...s, hospital: true })));
    add(3800, () => {
      setTimelineDone(3); // services alerted
    });
    add(5500, () => {
      setStatus((s) => ({ ...s, community: true }));
      setTimelineDone(4); // community search started
      setResponders([
        { ...DEMO_RESPONDERS[0], status: "notified" },
        { ...DEMO_RESPONDERS[1], status: "notified" },
      ]);
    });
    add(8500,  () => setResponders((r) => r.map((x) => x.id === "r1" ? { ...x, status: "accepted"   } : x)));
    add(12000, () => {
      setTimelineDone(5);
      setResponders((r) => r.map((x) => x.id === "r1" ? { ...x, status: "travelling" } : x));
    });
    add(18000, () => setResponders((r) => r.map((x) => x.id === "r2" ? { ...x, status: "accepted"   } : x)));
    add(28000, () => setResponders((r) => r.map((x) => x.id === "r1" ? { ...x, status: "arrived"    } : x)));
    add(34000, () => setResponders((r) => r.map((x) => x.id === "r2" ? { ...x, status: "travelling" } : x)));

    return () => ts.forEach(clearTimeout);
  }, []);

  const mapUrl = location
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${location.lng - 0.014},${location.lat - 0.014},${location.lng + 0.014},${location.lat + 0.014}&layer=mapnik&marker=${location.lat},${location.lng}`
    : null;

  return (
    <motion.div
      className="flex h-full flex-col"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* ── Sticky header ── */}
      <div className="shrink-0 border-b border-white/10 bg-[#0a0a0a]/90 px-5 py-3.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-red-800/80 text-[18px]">
              {typeInfo?.icon ?? "🚨"}
              <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full border border-[#0a0a0a] bg-red-500">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-red-300" />
              </span>
            </div>
            <div>
              <p className="font-display text-[14px] font-bold text-white">
                {typeInfo?.label ?? "Emergency"} · LIVE
              </p>
              {location && (
                <p className="flex items-center gap-1 text-[11px] text-white/38">
                  <MapPin className="h-3 w-3" />
                  {[location.suburb, location.district].filter(Boolean).join(", ") || location.address}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/38 transition-colors hover:border-white/22 hover:text-white/65"
          >
            Close
          </button>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-lg space-y-5 px-5 py-5 pb-14">

          {/* AI Chat stream */}
          <motion.div
            className="space-y-2.5"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">
              🤖 Allma AI — live guidance
            </p>
            <div className="space-y-2">
              {aiLog.map((msg, i) => (
                <AiChatBubble key={i} text={msg} />
              ))}
              {aiTyping && <AiChatBubble text={aiTyping} typing />}
            </div>
          </motion.div>

          {/* Live status grid */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">
              📡 Live status
            </p>
            <div className="grid grid-cols-2 gap-2">
              <StatusTile icon="📍" label="Location Sharing" value="Active · Live GPS" color="green"  visible />
              <StatusTile icon="🚔" label="Police"           value="Notified · En Route" color="blue"  visible={status.police}   />
              <StatusTile icon="🏥" label="Hospital"         value="Alerted · On Standby" color="green" visible={status.hospital}  />
              <StatusTile icon="👥" label="Community Search" value={`${(COMMUNITY_RADIUS[emergencyType] ?? 1000) / 1000} km radius`} color="amber" visible={status.community} />
            </div>
          </motion.div>

          {/* Call buttons */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">
              📞 Call now — tap to dial
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {info.primaryCalls.map((e) => (
                <a
                  key={e.label + e.number}
                  href={`tel:${e.number}`}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br ${e.color} px-3 py-4 transition-all active:scale-[0.96]`}
                  style={{ boxShadow: `0 4px 22px ${e.glow}` }}
                >
                  <Phone className="h-4.5 w-4.5 text-white/80" />
                  <span className="font-display text-[24px] font-black text-white">{e.number}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/68">{e.label}</span>
                </a>
              ))}
            </div>
          </motion.div>

          {/* Live map with GPS pulse overlay */}
          {mapUrl && (
            <motion.div
              className="overflow-hidden rounded-2xl border border-white/10"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="relative">
                <iframe
                  src={mapUrl}
                  title="Your live location"
                  className="h-48 w-full"
                  style={{ filter: "invert(0.88) hue-rotate(180deg)" }}
                />
                {/* GPS pulse overlay centered on map */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="relative flex items-center justify-center">
                    <span className="absolute h-16 w-16 animate-ping rounded-full bg-red-500/20 [animation-duration:1.4s]" />
                    <span className="absolute h-8 w-8 animate-ping rounded-full bg-red-500/30 [animation-duration:1s]" />
                    <span className="h-4 w-4 rounded-full border-2 border-white bg-red-500 shadow-[0_0_12px_rgba(220,38,38,0.8)]" />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-white/5 px-4 py-2.5 text-[12px] text-white/48">
                <Navigation2 className="h-3.5 w-3.5 text-red-400" />
                {location?.address}{location?.district ? `, ${location.district}` : ""}
                <span className="ml-auto flex items-center gap-1 text-green-400/70">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                  Live
                </span>
              </div>
            </motion.div>
          )}

          {/* Community responders */}
          <AnimatePresence>
            {responders.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <p className="mb-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">
                  🚑 Community responders
                  <span className="rounded-full bg-amber-900/60 px-2 py-0.5 font-normal normal-case tracking-normal text-amber-400">
                    {responders.filter((r) => r.status !== "notified").length} responding
                  </span>
                </p>
                <div className="space-y-2">
                  {responders.map((r) => (
                    <ResponderCard key={r.id} responder={r} />
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-white/20">
                  Privacy protected · Exact location not shared with community
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* What to do right now */}
          <motion.div
            className="rounded-2xl border border-red-900/30 bg-red-950/20 p-5 backdrop-blur-md"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
          >
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-red-400/80">
              🚨 What to do right now
            </p>
            <ol className="space-y-3">
              {info.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-700/80 text-[10px] font-black text-white">
                    {i + 1}
                  </span>
                  <span className="text-[14px] leading-snug text-white/82">{step}</span>
                </li>
              ))}
            </ol>
          </motion.div>

          {/* Nearby facilities — ordered by emergency type relevance */}
          {showPoliceFirst ? (
            <>
              <FacilitySection title="🚔 Officers on duty" demo facilities={officers} delay={0.26} />
              {info.showHospitals && <FacilitySection title="🏥 Nearest hospitals" facilities={hospitals} delay={0.3} />}
            </>
          ) : (
            <>
              {info.showHospitals && <FacilitySection title="🏥 Nearest hospitals" facilities={hospitals} delay={0.26} />}
              <FacilitySection title="🚔 Officers on duty" demo facilities={officers} delay={0.3} />
            </>
          )}

          {/* Emergency timeline */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32 }}
          >
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">
              🕐 Emergency timeline
            </p>
            <div>
              {TIMELINE.map((ev, i) => (
                <div key={i} className="flex gap-3">
                  <TimelineDot done={i < timelineDone} last={i === TIMELINE.length - 1} />
                  <div className="pb-4">
                    <p className={`text-[13px] font-medium transition-colors duration-500 ${i < timelineDone ? "text-white/80" : "text-white/22"}`}>
                      {ev.label}
                    </p>
                    {ev.sub && (
                      <p className={`text-[11px] transition-colors duration-500 ${i < timelineDone ? "text-white/38" : "text-white/12"}`}>
                        {ev.sub}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Actions */}
          <motion.div
            className="space-y-2 pt-1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <button
              onClick={onReport}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/12 py-3.5 text-[13px] font-medium text-white/52 transition-colors hover:border-white/22 hover:text-white/78"
            >
              <Shield className="h-4 w-4" />
              File an incident report
            </button>
            <button
              onClick={onClose}
              className="w-full py-2.5 text-[11px] text-white/20 hover:text-white/40"
            >
              I'm safe — close SOS
            </button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function FacilitySection({
  title, facilities, delay, demo,
}: {
  title: string; facilities: Facility[]; delay: number; demo?: boolean;
}) {
  if (!facilities.length) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <p className="mb-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">
        {title}
        {demo && <span className="font-normal normal-case tracking-normal text-white/20">(demo)</span>}
      </p>
      <div className="space-y-2">
        {facilities.map((f, i) => <FacilityRow key={i} facility={f} />)}
      </div>
    </motion.div>
  );
}

function FacilityRow({ facility }: { facility: Facility }) {
  const isHospital = facility.type === "hospital";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/5 px-4 py-3 backdrop-blur-sm">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isHospital ? "bg-green-950/70" : "bg-blue-950/70"}`}>
        {isHospital
          ? <Building2 className="h-4 w-4 text-green-400" />
          : <Shield className="h-4 w-4 text-blue-400" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-white/88">{facility.name}</p>
        <p className="flex items-center gap-1.5 text-[11px] text-white/38">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{facility.address}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className={`text-[11px] font-semibold ${isHospital ? "text-green-400/80" : "text-blue-400/80"}`}>
          {facility.distance}
        </span>
        <a
          href={`tel:${facility.phone.replace(/\s/g, "")}`}
          className="flex items-center gap-1 rounded-lg bg-white/8 px-2.5 py-1 text-[10px] font-semibold text-white/65 transition-colors hover:bg-white/14"
        >
          <Phone className="h-3 w-3" />
          Call
        </a>
      </div>
    </div>
  );
}

// ─── Quick Report ─────────────────────────────────────────────────────────────

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
      className="flex h-full flex-col overflow-y-auto px-5 pt-10 pb-10"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mx-auto w-full max-w-sm">
        <button
          onClick={onBack}
          className="mb-5 flex items-center gap-1.5 text-[13px] text-white/38 hover:text-white/62"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h2 className="mb-1 font-display text-xl font-bold text-white">Quick incident report</h2>
        <p className="mb-6 text-[13px] text-white/40">Takes 30 seconds. Helps responders understand the situation.</p>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">
            What happened?
          </label>
          <textarea
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            placeholder="Briefly describe the situation — e.g. 'A man grabbed my bag near Shoprite and ran toward the market.'"
            rows={5}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[14px] leading-relaxed text-white outline-none placeholder:text-white/22 focus:border-red-600/50"
          />
        </div>
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-700 py-4 font-display text-[15px] font-bold text-white hover:bg-red-600 disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          {submitting ? "Submitting…" : "Submit report"}
        </button>
        <button onClick={onBack} className="mt-2.5 w-full py-3 text-[12px] text-white/22 hover:text-white/42">
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
        className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-950/60"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: "spring" }}
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
          className="mb-4 rounded-xl border border-white/10 bg-white/5 px-5 py-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24 }}
        >
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Reference</p>
          <p className="mt-1 font-display text-xl font-black tracking-wide text-amber-400">{reference}</p>
        </motion.div>
      )}
      <motion.p
        className="mb-10 max-w-xs text-[14px] leading-relaxed text-white/45"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28 }}
      >
        The nearest responding team has been notified. Stay safe.
      </motion.p>
      <motion.button
        onClick={onDone}
        className="flex items-center gap-2 rounded-2xl bg-white/10 px-8 py-3.5 text-[14px] font-medium text-white/75 hover:bg-white/15"
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
