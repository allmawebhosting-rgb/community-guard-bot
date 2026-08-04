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

type Phase = "idle" | "loading" | "help" | "report" | "submitted";

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

// ─── Emergency numbers ────────────────────────────────────────────────────────

const EMERGENCY_NUMBERS = [
  { label: "Police",            number: "999", color: "from-blue-700 to-blue-800",   glow: "rgba(59,130,246,0.35)" },
  { label: "Ambulance",         number: "911", color: "from-green-700 to-green-800", glow: "rgba(34,197,94,0.35)"  },
  { label: "Fire Brigade",      number: "112", color: "from-orange-700 to-red-800",  glow: "rgba(234,88,12,0.35)"  },
  { label: "General Emergency", number: "112", color: "from-gray-700 to-gray-800",   glow: "rgba(156,163,175,0.2)" },
];

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
  const [location, setLocation] = useState<LocationInfo | null>(null);
  const [hospitals, setHospitals] = useState<Facility[]>([]);
  const [officers, setOfficers] = useState<Facility[]>([]);
  const [reportText, setReportText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const activated = useRef(false);

  async function activate() {
    if (activated.current) return;
    activated.current = true;
    setPhase("loading");

    // Get location
    let loc: LocationInfo | null = null;
    try {
      loc = await getLocation();
    } catch {
      loc = null;
    }

    // Use demo location as fallback
    const finalLoc: LocationInfo = loc ?? {
      address: "Kampala Road", suburb: "Nakasero",
      district: "Kampala Central", lat: 0.3476, lng: 32.5825,
    };
    setLocation(finalLoc);

    // Fetch nearby facilities in parallel, with demo fallback
    const [realHospitals, realPolice] = await Promise.all([
      fetchOverpass(finalLoc.lat, finalLoc.lng, "hospital")
        .catch(() => [] as Facility[]),
      fetchOverpass(finalLoc.lat, finalLoc.lng, "police")
        .catch(() => [] as Facility[]),
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
        {phase === "idle"      && <IdleScreen      key="idle"      onActivate={activate} />}
        {phase === "loading"   && <LoadingScreen   key="loading"   />}
        {phase === "help"      && (
          <HelpScreen
            key="help"
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

// ─── Loading ──────────────────────────────────────────────────────────────────

function LoadingScreen() {
  const steps = ["Activating emergency mode…", "Detecting your location…", "Finding nearest hospitals & officers…"];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 800);
    const t2 = setTimeout(() => setStep(2), 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-8 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Pulsing siren icon */}
      <motion.div
        className="mb-8 flex h-28 w-28 items-center justify-center rounded-full"
        style={{ background: "radial-gradient(circle, rgba(220,38,38,0.28) 0%, transparent 72%)" }}
        animate={{ scale: [1, 1.1, 1], opacity: [1, 0.75, 1] }}
        transition={{ duration: 0.9, repeat: Infinity }}
      >
        <Siren className="h-14 w-14 text-red-500" strokeWidth={1.5} />
      </motion.div>

      {/* Step list */}
      <div className="space-y-3">
        {steps.map((s, i) => (
          <motion.div
            key={i}
            className={`flex items-center gap-3 text-[14px] transition-colors ${i <= step ? "text-white" : "text-white/20"}`}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            {i < step ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
            ) : i === step ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-400" />
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-full border border-white/20" />
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
  location,
  hospitals,
  officers,
  onReport,
  onClose,
}: {
  location: LocationInfo | null;
  hospitals: Facility[];
  officers: Facility[];
  onReport: () => void;
  onClose: () => void;
}) {
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
      {/* Header */}
      <div className="shrink-0 border-b border-white/10 bg-[#0d0d0d]/80 px-5 py-3.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-700">
              <Siren className="h-4 w-4 text-white" />
            </span>
            <div>
              <p className="flex items-center gap-1.5 font-display text-[14px] font-bold text-white">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                Emergency Active
              </p>
              {location && (
                <p className="flex items-center gap-1 text-[11px] text-white/40">
                  <MapPin className="h-3 w-3" />
                  {[location.suburb, location.district].filter(Boolean).join(", ") || location.address}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/40 hover:text-white/65"
          >
            Close
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-lg space-y-4 px-5 py-5 pb-10">

          {/* Live map */}
          {mapUrl && (
            <motion.div
              className="overflow-hidden rounded-2xl border border-white/10"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 }}
            >
              <iframe
                src={mapUrl}
                title="Your live location"
                className="h-44 w-full"
                style={{ filter: "invert(0.88) hue-rotate(180deg)" }}
              />
              <div className="flex items-center gap-2 bg-white/5 px-4 py-2.5 text-[12px] text-white/50">
                <Navigation2 className="h-3.5 w-3.5 text-red-400" />
                {location?.address}{location?.district ? `, ${location.district}` : ""}
              </div>
            </motion.div>
          )}

          {/* Emergency call buttons */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/38">
              📞 Emergency numbers — tap to call
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {EMERGENCY_NUMBERS.map((e) => (
                <a
                  key={e.label + e.number}
                  href={`tel:${e.number}`}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br ${e.color} px-3 py-4 transition-all active:scale-95`}
                  style={{ boxShadow: `0 4px 20px ${e.glow}` }}
                >
                  <Phone className="h-5 w-5 text-white/80" />
                  <span className="font-display text-[22px] font-black text-white">{e.number}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70">{e.label}</span>
                </a>
              ))}
            </div>
          </motion.div>

          {/* Nearby hospitals */}
          {hospitals.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.13 }}
            >
              <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/38">
                🏥 Nearest hospitals
              </p>
              <div className="space-y-2">
                {hospitals.map((h, i) => (
                  <FacilityRow key={i} facility={h} />
                ))}
              </div>
            </motion.div>
          )}

          {/* Officers on duty */}
          {officers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
            >
              <p className="mb-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/38">
                🚔 Officers on duty
                <span className="font-normal normal-case tracking-normal text-white/22">(demo)</span>
              </p>
              <div className="space-y-2">
                {officers.map((o, i) => (
                  <FacilityRow key={i} facility={o} />
                ))}
              </div>
            </motion.div>
          )}

          {/* File report */}
          <motion.div
            className="space-y-2 pt-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
          >
            <button
              onClick={onReport}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/12 py-3.5 text-[13px] font-medium text-white/55 transition-colors hover:border-white/20 hover:text-white/80"
            >
              <Shield className="h-4 w-4" />
              File an incident report
            </button>
            <button
              onClick={onClose}
              className="w-full py-2.5 text-[11px] text-white/22 hover:text-white/42"
            >
              I'm safe — close SOS
            </button>
          </motion.div>
        </div>
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
