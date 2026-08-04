import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Siren,
  MapPin,
  Phone,
  CheckCircle2,
  Loader2,
  Clock,
  ChevronRight,
  Shield,
  User,
  ArrowLeft,
  Send,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | "idle"
  | "activating"
  | "locating"
  | "type-select"
  | "help"
  | "report"
  | "submitted";

type LocationInfo = {
  address: string;
  village: string;
  district: string;
  lat: number;
  lng: number;
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const DEMO_LOCATION: LocationInfo = {
  address: "Kampala Road",
  village: "Nakasero",
  district: "Kampala Central",
  lat: 0.3476,
  lng: 32.5825,
};

const EMERGENCY_TYPES = [
  { id: "crime",    icon: "🚔", label: "Crime" },
  { id: "medical",  icon: "🚑", label: "Medical" },
  { id: "fire",     icon: "🔥", label: "Fire" },
  { id: "attack",   icon: "⚔️",  label: "Attack" },
  { id: "accident", icon: "🚗", label: "Road Accident" },
  { id: "missing",  icon: "👤", label: "Missing Person" },
  { id: "domestic", icon: "🏠", label: "Domestic Violence" },
  { id: "other",    icon: "⚡", label: "Other" },
];

type HelpInfo = {
  steps: string[];
  calls: { label: string; number: string; color: string }[];
  priority: string;
  priorityColor: string;
};

const HELP: Record<string, HelpInfo> = {
  crime: {
    priority: "HIGH",
    priorityColor: "text-amber-400 border-amber-700/60 bg-amber-950/50",
    steps: [
      "Move to a safe location away from the suspect immediately.",
      "Do not confront or chase — your safety comes first.",
      "Note any description of the suspect (clothing, direction, vehicle).",
    ],
    calls: [
      { label: "Police", number: "999", color: "bg-blue-700 hover:bg-blue-600" },
      { label: "General Emergency", number: "112", color: "bg-gray-700 hover:bg-gray-600" },
    ],
  },
  medical: {
    priority: "CRITICAL",
    priorityColor: "text-red-400 border-red-700/60 bg-red-950/50",
    steps: [
      "Keep the person still and calm — do not move them unnecessarily.",
      "Check if they are breathing. If not, begin CPR if trained.",
      "Do not give food, water, or medication unless instructed by a dispatcher.",
    ],
    calls: [
      { label: "Ambulance", number: "911", color: "bg-green-700 hover:bg-green-600" },
      { label: "General Emergency", number: "112", color: "bg-gray-700 hover:bg-gray-600" },
    ],
  },
  fire: {
    priority: "CRITICAL",
    priorityColor: "text-red-400 border-red-700/60 bg-red-950/50",
    steps: [
      "Evacuate everyone immediately — do not attempt to fight the fire yourself.",
      "Stay low under smoke and use stairs, never lifts.",
      "Once outside, move far away and do not re-enter.",
    ],
    calls: [
      { label: "Fire Brigade", number: "112", color: "bg-orange-700 hover:bg-orange-600" },
      { label: "Ambulance", number: "911", color: "bg-green-700 hover:bg-green-600" },
    ],
  },
  attack: {
    priority: "CRITICAL",
    priorityColor: "text-red-400 border-red-700/60 bg-red-950/50",
    steps: [
      "Get to a safe, locked location immediately.",
      "Stay quiet and keep your phone on silent.",
      "Call police and stay on the line — do not hang up.",
    ],
    calls: [
      { label: "Police", number: "999", color: "bg-blue-700 hover:bg-blue-600" },
      { label: "General Emergency", number: "112", color: "bg-gray-700 hover:bg-gray-600" },
    ],
  },
  accident: {
    priority: "HIGH",
    priorityColor: "text-amber-400 border-amber-700/60 bg-amber-950/50",
    steps: [
      "Turn on hazard lights and move vehicles off the road if safe.",
      "Do not move injured persons unless there is immediate danger.",
      "Keep bystanders away and secure the scene.",
    ],
    calls: [
      { label: "Ambulance", number: "911", color: "bg-green-700 hover:bg-green-600" },
      { label: "Police", number: "999", color: "bg-blue-700 hover:bg-blue-600" },
    ],
  },
  missing: {
    priority: "HIGH",
    priorityColor: "text-amber-400 border-amber-700/60 bg-amber-950/50",
    steps: [
      "Check the immediate area and places the person usually goes.",
      "Gather a recent photo and description before calling police.",
      "Do not wait — report immediately, there is no minimum wait time.",
    ],
    calls: [
      { label: "Police", number: "999", color: "bg-blue-700 hover:bg-blue-600" },
      { label: "General Emergency", number: "112", color: "bg-gray-700 hover:bg-gray-600" },
    ],
  },
  domestic: {
    priority: "CRITICAL",
    priorityColor: "text-red-400 border-red-700/60 bg-red-950/50",
    steps: [
      "If in immediate danger, leave the house and go to a neighbour or public place.",
      "Take children with you if possible.",
      "Do not try to reason or negotiate — your safety is the priority.",
    ],
    calls: [
      { label: "Police", number: "999", color: "bg-blue-700 hover:bg-blue-600" },
      { label: "General Emergency", number: "112", color: "bg-gray-700 hover:bg-gray-600" },
    ],
  },
  other: {
    priority: "MEDIUM",
    priorityColor: "text-yellow-400 border-yellow-700/60 bg-yellow-950/40",
    steps: [
      "Stay calm and move to a safe location if needed.",
      "Call the appropriate emergency service below.",
      "Stay on the line and follow the dispatcher's instructions.",
    ],
    calls: [
      { label: "General Emergency", number: "112", color: "bg-gray-700 hover:bg-gray-600" },
      { label: "Police", number: "999", color: "bg-blue-700 hover:bg-blue-600" },
      { label: "Ambulance", number: "911", color: "bg-green-700 hover:bg-green-600" },
    ],
  },
};

const DEMO_OFFICERS = [
  { name: "Inspector Sarah N.", station: "Central Police Station", phone: "+256 774 620 951", status: "Available", eta: "4 min", available: true },
  { name: "Sergeant David K.",  station: "East Division",          phone: "+256 774 620 951", status: "Patrolling", eta: "6 min", available: false },
  { name: "Corporal Grace A.",  station: "North Patrol Unit",      phone: "+256 774 620 951", status: "Available", eta: "8 min", available: true },
];

// ─── Main component ────────────────────────────────────────────────────────────

export function SOSExperience() {
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>("idle");
  const [location, setLocation] = useState<LocationInfo | null>(null);
  const [locating, setLocating] = useState(false);
  const [emergencyType, setEmergencyType] = useState("other");
  const [reportText, setReportText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const locDone = useRef(false);

  function requestLocation() {
    setLocating(true);
    locDone.current = false;
    if (!("geolocation" in navigator)) {
      setTimeout(() => { setLocation(DEMO_LOCATION); setLocating(false); }, 1800);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const d = await res.json();
          setLocation({
            address: d.address?.road || d.display_name?.split(",")[0] || "Current Location",
            village: d.address?.village || d.address?.suburb || d.address?.neighbourhood || "N/A",
            district: d.address?.city || d.address?.county || "N/A",
            lat, lng,
          });
        } catch {
          setLocation({ ...DEMO_LOCATION, lat, lng });
        }
        setLocating(false);
      },
      () => { setLocation(DEMO_LOCATION); setLocating(false); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  // Auto-advance to type-select once location is found
  useEffect(() => {
    if (!locating && location && phase === "locating" && !locDone.current) {
      locDone.current = true;
      const t = setTimeout(() => setPhase("type-select"), 900);
      return () => clearTimeout(t);
    }
  }, [locating, location, phase]);

  function handleSosPress() {
    setPhase("activating");
    setTimeout(() => { setPhase("locating"); requestLocation(); }, 1200);
  }

  function handleTypeSelect(type: string) {
    setEmergencyType(type);
    setPhase("help");
  }

  async function handleSubmitReport() {
    setSubmitting(true);
    const ref = `ASA-2026-${String(Math.floor(Math.random() * 900000 + 100000))}`;
    if (user) {
      await supabase.from("reports").insert({
        user_id: user.id,
        report_type: "emergency",
        category: emergencyType,
        title: `Emergency SOS — ${EMERGENCY_TYPES.find(t => t.id === emergencyType)?.label || emergencyType}`,
        summary: reportText || "Emergency SOS submitted.",
        narrative: reportText,
        risk_level: HELP[emergencyType]?.priority === "CRITICAL" ? "critical" : HELP[emergencyType]?.priority === "HIGH" ? "high" : "medium",
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
        location_text: location ? `${location.address}, ${location.district}` : "Location unavailable",
      });
    }
    setReference(ref);
    setSubmitting(false);
    setPhase("submitted");
  }

  return (
    <div className="dark fixed inset-0 z-[100] overflow-hidden bg-[#070707]">
      {/* Ambient Uganda gradient */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(180,20,20,0.20) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 110%, rgba(255,185,0,0.09) 0%, transparent 55%)" }}
      />

      <AnimatePresence mode="wait">
        {phase === "idle"        && <IdleScreen       key="idle"        onActivate={handleSosPress} />}
        {phase === "activating"  && <ActivatingScreen key="activating" />}
        {phase === "locating"    && <LocatingScreen   key="locating"    location={location} locating={locating} />}
        {phase === "type-select" && <TypeSelectScreen key="type-select" location={location} onSelect={handleTypeSelect} />}
        {phase === "help"        && (
          <HelpScreen
            key="help"
            emergencyType={emergencyType}
            location={location}
            onReport={() => setPhase("report")}
            onDone={() => setPhase("idle")}
          />
        )}
        {phase === "report" && (
          <ReportScreen
            key="report"
            emergencyType={emergencyType}
            reportText={reportText}
            setReportText={setReportText}
            onSubmit={handleSubmitReport}
            onBack={() => setPhase("help")}
            submitting={submitting}
          />
        )}
        {phase === "submitted" && <SubmittedScreen key="submitted" reference={reference} onDone={() => setPhase("idle")} />}
      </AnimatePresence>
    </div>
  );
}

// ─── Idle ─────────────────────────────────────────────────────────────────────

function IdleScreen({ onActivate }: { onActivate: () => void }) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-6 text-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.3 }}
    >
      <motion.p
        className="mb-3 text-[11px] font-bold uppercase tracking-[0.25em] text-red-400/80"
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
      >
        Allma Safety AI · Demo Mode
      </motion.p>
      <motion.h1
        className="mb-2 font-display text-3xl font-black text-white"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
      >
        Emergency SOS
      </motion.h1>
      <motion.p
        className="mb-14 max-w-xs text-[14px] leading-relaxed text-white/40"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
      >
        Tap the button to get immediate help.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.25, type: "spring", stiffness: 260, damping: 20 }}
        className="relative"
      >
        <span className="absolute inset-0 animate-ping rounded-full bg-red-600/18" />
        <span className="absolute -inset-4 animate-ping rounded-full bg-red-600/09 [animation-delay:0.4s]" />
        <button
          onClick={onActivate}
          className="relative h-52 w-52 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-4 focus-visible:ring-offset-[#070707]"
          aria-label="Activate Emergency SOS"
        >
          <span className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 0deg, #dc2626, #fbbf24 40%, #dc2626 70%, #991b1b)", padding: "3px" }} />
          <span className="absolute inset-[3px] rounded-full bg-[#070707]" />
          <span className="absolute inset-[14px] flex items-center justify-center rounded-full bg-gradient-to-br from-red-700 to-red-900 shadow-[0_0_60px_rgba(220,38,38,0.5)]">
            <span className="font-display text-[28px] font-black tracking-[0.18em] text-white">SOS</span>
          </span>
        </button>
      </motion.div>

      <motion.p
        className="mt-14 text-[11px] text-white/25"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
      >
        Demo · No real emergency services contacted
      </motion.p>
    </motion.div>
  );
}

// ─── Activating ───────────────────────────────────────────────────────────────

function ActivatingScreen() {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div
        className="flex h-40 w-40 items-center justify-center rounded-full"
        style={{ background: "radial-gradient(circle, rgba(220,38,38,0.28) 0%, rgba(220,38,38,0) 70%)" }}
        animate={{ scale: [1, 1.14, 1], opacity: [1, 0.7, 1] }}
        transition={{ duration: 0.55, repeat: Infinity }}
      >
        <Siren className="h-20 w-20 text-red-500" strokeWidth={1.5} />
      </motion.div>
      <motion.p
        className="mt-8 font-display text-2xl font-black text-white"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
      >
        Activating…
      </motion.p>
    </motion.div>
  );
}

// ─── Locating ─────────────────────────────────────────────────────────────────

function LocatingScreen({ location, locating }: { location: LocationInfo | null; locating: boolean }) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-6"
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35 }}
    >
      <div className="w-full max-w-sm space-y-4">
        {/* Emergency activated card */}
        <div className="rounded-2xl border border-white/10 bg-white/6 p-5 backdrop-blur-md">
          <div className="mb-3 flex items-center gap-3">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
              <Siren className="h-6 w-6 text-red-500" />
            </motion.div>
            <p className="font-display text-base font-bold text-white">🚨 Emergency Mode Activated</p>
          </div>
          <p className="text-[14px] leading-relaxed text-white/65">
            Please stay calm. I'm finding your location to connect you with the right help.
          </p>
        </div>

        {/* Location card */}
        <div className="rounded-2xl border border-white/10 bg-white/6 p-5 backdrop-blur-md">
          {locating ? (
            <div className="flex items-center gap-3 text-[14px] text-white/55">
              <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
              Detecting your location…
            </div>
          ) : location ? (
            <div className="space-y-2 text-[13px]">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-green-400">
                <MapPin className="h-3.5 w-3.5" /> Location confirmed
              </div>
              <p className="font-medium text-white/90">{location.address}</p>
              <p className="text-white/50">{location.village} · {location.district}</p>
              <p className="text-[11px] tabular-nums text-white/30">{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</p>
            </div>
          ) : (
            <p className="text-[13px] text-white/40">Using demo location…</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Type Select ──────────────────────────────────────────────────────────────

function TypeSelectScreen({ location, onSelect }: { location: LocationInfo | null; onSelect: (t: string) => void }) {
  return (
    <motion.div
      className="flex h-full flex-col overflow-y-auto px-5 pt-12 pb-10"
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35 }}
    >
      <div className="mx-auto w-full max-w-sm">
        {location && (
          <motion.div
            className="mb-4 flex items-center gap-2 rounded-xl border border-green-800/50 bg-green-950/40 px-4 py-2.5 text-[12px] text-green-400"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span>Location confirmed: <strong>{location.village}, {location.district}</strong></span>
          </motion.div>
        )}

        <motion.p
          className="mb-4 font-display text-lg font-bold text-white"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        >
          What's happening?
        </motion.p>

        <div className="grid grid-cols-2 gap-3">
          {EMERGENCY_TYPES.map((et, i) => (
            <motion.button
              key={et.id}
              onClick={() => onSelect(et.id)}
              className="group flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur-md transition-all hover:border-red-700/60 hover:bg-red-950/40 active:scale-95"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.04 }}
              whileTap={{ scale: 0.95 }}
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

// ─── Help Screen (the main screen) ───────────────────────────────────────────

function HelpScreen({
  emergencyType,
  location,
  onReport,
  onDone,
}: {
  emergencyType: string;
  location: LocationInfo | null;
  onReport: () => void;
  onDone: () => void;
}) {
  const info = HELP[emergencyType] || HELP.other;
  const typeInfo = EMERGENCY_TYPES.find((t) => t.id === emergencyType);

  return (
    <motion.div
      className="flex h-full flex-col overflow-y-auto"
      initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.35 }}
    >
      {/* Header */}
      <div className="shrink-0 border-b border-white/10 bg-[#0e0e0e]/80 px-5 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-sm items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{typeInfo?.icon}</span>
            <div>
              <p className="font-display text-[15px] font-bold text-white">{typeInfo?.label}</p>
              {location && (
                <p className="flex items-center gap-1 text-[11px] text-white/40">
                  <MapPin className="h-3 w-3" /> {location.village}, {location.district}
                </p>
              )}
            </div>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${info.priorityColor}`}>
            {info.priority}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto max-w-sm space-y-4">

          {/* What to do now */}
          <motion.div
            className="rounded-2xl border border-white/10 bg-white/6 p-5 backdrop-blur-md"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          >
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-red-400">
              🚨 What to do right now
            </p>
            <ol className="space-y-3">
              {info.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-700 text-[10px] font-black text-white">
                    {i + 1}
                  </span>
                  <span className="text-[14px] leading-snug text-white/85">{step}</span>
                </li>
              ))}
            </ol>
          </motion.div>

          {/* Call buttons */}
          <motion.div
            className="space-y-2.5"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
              📞 Call now
            </p>
            {info.calls.map((c) => (
              <a
                key={c.number + c.label}
                href={`tel:${c.number}`}
                className={`flex items-center justify-between rounded-2xl px-5 py-4 text-white transition-all active:scale-98 ${c.color}`}
              >
                <span className="font-display text-[15px] font-bold">{c.label}</span>
                <span className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  <span className="font-display text-xl font-black tracking-wide">{c.number}</span>
                </span>
              </a>
            ))}
          </motion.div>

          {/* Nearest responders */}
          <motion.div
            className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur-md"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
          >
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
              🚔 Nearest responders <span className="ml-1 font-normal normal-case text-white/25">(demo)</span>
            </p>
            <div className="space-y-3">
              {DEMO_OFFICERS.map((o) => (
                <div key={o.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-950/60">
                      <User className="h-4 w-4 text-blue-400" />
                    </span>
                    <div>
                      <p className="text-[13px] font-medium text-white/85">{o.name}</p>
                      <p className="text-[11px] text-white/35">{o.station}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="text-right">
                      <p className={`text-[11px] font-semibold ${o.available ? "text-green-400" : "text-amber-400"}`}>{o.status}</p>
                      <p className="flex items-center gap-1 text-[10px] text-white/30"><Clock className="h-3 w-3" />{o.eta}</p>
                    </div>
                    <a href={`tel:${o.phone.replace(/\s/g, "")}`}
                      className="grid h-8 w-8 place-items-center rounded-full bg-red-950/60 text-red-400 transition-colors hover:bg-red-900/60"
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Bottom actions */}
          <motion.div
            className="space-y-2.5 pt-1 pb-4"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}
          >
            <button
              onClick={onReport}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/12 py-3.5 text-[13px] font-medium text-white/60 transition-colors hover:border-white/20 hover:text-white/80"
            >
              <Shield className="h-4 w-4" />
              File an incident report
            </button>
            <button
              onClick={onDone}
              className="w-full rounded-2xl py-3 text-[12px] text-white/25 transition-colors hover:text-white/45"
            >
              I'm safe — close SOS
            </button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Quick Report ─────────────────────────────────────────────────────────────

function ReportScreen({
  emergencyType,
  reportText,
  setReportText,
  onSubmit,
  onBack,
  submitting,
}: {
  emergencyType: string;
  reportText: string;
  setReportText: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
}) {
  return (
    <motion.div
      className="flex h-full flex-col overflow-y-auto px-5 pt-12 pb-10"
      initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.35 }}
    >
      <div className="mx-auto w-full max-w-sm">
        <button onClick={onBack} className="mb-5 flex items-center gap-1.5 text-[13px] text-white/40 hover:text-white/65">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h2 className="mb-1 font-display text-xl font-bold text-white">Quick incident report</h2>
        <p className="mb-6 text-[13px] text-white/45">Takes 30 seconds. Helps responders understand the situation.</p>

        <div className="rounded-2xl border border-white/10 bg-white/6 p-5 backdrop-blur-md">
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">
            What happened?
          </label>
          <textarea
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            placeholder="Briefly describe the situation — e.g. 'A man grabbed my bag near Shoprite and ran towards the market.'"
            rows={5}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[14px] leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-red-600/50 focus:bg-white/8"
          />
        </div>

        <button
          onClick={onSubmit}
          disabled={submitting}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-700 py-4 font-display text-[15px] font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          {submitting ? "Submitting…" : "Submit report"}
        </button>

        <button
          onClick={onBack}
          className="mt-2.5 w-full py-3 text-[12px] text-white/25 hover:text-white/45"
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
      initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.4, type: "spring", stiffness: 260, damping: 20 }}
    >
      <motion.div
        className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-950/60"
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1, type: "spring" }}
      >
        <CheckCircle2 className="h-10 w-10 text-green-400" />
      </motion.div>

      <motion.h2
        className="mb-2 font-display text-2xl font-black text-white"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
      >
        Report Submitted
      </motion.h2>

      {reference && (
        <motion.div
          className="mb-4 rounded-xl border border-white/10 bg-white/5 px-5 py-3"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
        >
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Reference</p>
          <p className="mt-1 font-display text-xl font-black tracking-wide text-amber-400">{reference}</p>
        </motion.div>
      )}

      <motion.p
        className="mb-10 max-w-xs text-[14px] leading-relaxed text-white/50"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}
      >
        The nearest responding team has been notified. Stay safe.
      </motion.p>

      <motion.button
        onClick={onDone}
        className="flex items-center gap-2 rounded-2xl bg-white/10 px-8 py-3.5 text-[14px] font-medium text-white/80 hover:bg-white/15"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}
        whileTap={{ scale: 0.97 }}
      >
        Close SOS
        <ChevronRight className="h-4 w-4" />
      </motion.button>
    </motion.div>
  );
}
