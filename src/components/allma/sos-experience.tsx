import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Siren,
  MapPin,
  Phone,
  Camera,
  Video,
  Mic,
  FileText,
  Navigation2,
  CheckCircle2,
  Send,
  Loader2,
  Clock,
  AlertTriangle,
  ChevronRight,
  SkipForward,
  Shield,
  User,
  Radio,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | "idle"
  | "activating"
  | "locating"
  | "type-select"
  | "interview"
  | "responders"
  | "review"
  | "submitted"
  | "live";

type Msg = {
  id: string;
  role: "ai" | "user";
  text: string;
  kind?: "evidence";
};

type LocationInfo = {
  address: string;
  village: string;
  district: string;
  region: string;
  lat: number;
  lng: number;
};

type IncidentSummary = {
  type: string;
  priority: string;
  location: string;
  description: string;
  evidence: number;
  timeline: { time: string; event: string }[];
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const DEMO_LOCATION: LocationInfo = {
  address: "Kampala Road",
  village: "Nakasero",
  district: "Kampala Central",
  region: "Central Uganda",
  lat: 0.3476,
  lng: 32.5825,
};

const EMERGENCY_TYPES = [
  { id: "crime", icon: "🚔", label: "Crime" },
  { id: "medical", icon: "🚑", label: "Medical Emergency" },
  { id: "fire", icon: "🔥", label: "Fire" },
  { id: "attack", icon: "⚔️", label: "Attack" },
  { id: "accident", icon: "🚗", label: "Road Accident" },
  { id: "missing", icon: "👤", label: "Missing Person" },
  { id: "domestic", icon: "🏠", label: "Domestic Violence" },
  { id: "other", icon: "⚡", label: "Other Emergency" },
];

const QUESTIONS: Record<string, string[]> = {
  crime: [
    "Is the suspect still nearby?",
    "Is anyone injured?",
    "What happened? Please describe briefly.",
    "Can you describe the suspect's appearance?",
  ],
  medical: [
    "Is the person conscious?",
    "Are they breathing normally?",
    "How old is the patient approximately?",
    "What symptoms are they showing?",
  ],
  fire: [
    "Is anyone trapped inside?",
    "Is the fire still spreading?",
    "What type of building or area is affected?",
    "Are you at a safe distance from the fire?",
  ],
  attack: [
    "Are you currently in a safe location?",
    "Is anyone injured?",
    "Where is the attacker now?",
    "How many people were involved in the attack?",
  ],
  accident: [
    "How many vehicles are involved?",
    "Are there any injuries?",
    "Is the road completely blocked?",
    "What type of vehicles are involved?",
  ],
  missing: [
    "How old is the missing person?",
    "When did you last see them?",
    "What were they wearing when last seen?",
    "Do they have any medical conditions we should know?",
  ],
  domestic: [
    "Are you currently in a safe location?",
    "Is anyone injured?",
    "Where are you right now?",
    "Are children present at the scene?",
  ],
  other: [
    "Can you describe what's happening?",
    "Is anyone in immediate danger?",
    "Where exactly are you located?",
    "Do you need medical assistance?",
  ],
};

const PRIORITIES: Record<string, string> = {
  crime: "HIGH",
  medical: "CRITICAL",
  fire: "CRITICAL",
  attack: "CRITICAL",
  accident: "HIGH",
  missing: "MEDIUM",
  domestic: "HIGH",
  other: "MEDIUM",
};

const DEMO_OFFICERS = [
  {
    name: "Inspector Sarah N.",
    station: "Central Police Station",
    phone: "+256 774 620 951",
    status: "Available",
    eta: "4 Minutes",
    available: true,
  },
  {
    name: "Sergeant David K.",
    station: "East Division",
    phone: "+256 774 620 951",
    status: "Patrolling",
    eta: "6 Minutes",
    available: false,
  },
  {
    name: "Corporal Grace A.",
    station: "North Patrol Unit",
    phone: "+256 774 620 951",
    status: "Available",
    eta: "8 Minutes",
    available: true,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}

function priorityColor(p: string) {
  if (p === "CRITICAL") return "text-red-400 bg-red-950/60 border-red-800/60";
  if (p === "HIGH") return "text-amber-400 bg-amber-950/60 border-amber-800/60";
  return "text-yellow-300 bg-yellow-950/60 border-yellow-800/60";
}

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function SOSExperience() {
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>("idle");
  const [location, setLocation] = useState<LocationInfo | null>(null);
  const [locating, setLocating] = useState(false);
  const [emergencyType, setEmergencyType] = useState<string>("other");

  const [messages, setMessages] = useState<Msg[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [evidenceShown, setEvidenceShown] = useState(false);
  const [evidenceDone, setEvidenceDone] = useState(false);
  const streamRef = useRef<ReturnType<typeof setInterval>>();
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [summary, setSummary] = useState<IncidentSummary>({
    type: "",
    priority: "",
    location: "",
    description: "",
    evidence: 0,
    timeline: [],
  });

  const [reference, setReference] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  // Focus input after streaming stops
  useEffect(() => {
    if (!isStreaming && phase === "interview") {
      inputRef.current?.focus();
    }
  }, [isStreaming, phase]);

  const streamMessage = useCallback(
    (text: string, onDone?: () => void) => {
      setStreamingText("");
      setIsStreaming(true);
      clearInterval(streamRef.current);
      let i = 0;
      streamRef.current = setInterval(() => {
        i++;
        setStreamingText(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(streamRef.current);
          setMessages((m) => [...m, { id: uid(), role: "ai", text }]);
          setStreamingText("");
          setIsStreaming(false);
          onDone?.();
        }
      }, 13);
    },
    [],
  );

  function requestLocation() {
    setLocating(true);
    if (!("geolocation" in navigator)) {
      setTimeout(() => {
        setLocation(DEMO_LOCATION);
        setLocating(false);
      }, 2200);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          );
          const data = await res.json();
          setLocation({
            address:
              data.address?.road ||
              data.display_name?.split(",")[0] ||
              "Current Location",
            village:
              data.address?.village ||
              data.address?.suburb ||
              data.address?.neighbourhood ||
              "N/A",
            district:
              data.address?.city || data.address?.county || "N/A",
            region: data.address?.state || "Uganda",
            lat,
            lng,
          });
        } catch {
          setLocation({ ...DEMO_LOCATION, lat, lng });
        }
        setLocating(false);
      },
      () => {
        setLocation(DEMO_LOCATION);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function handleSosPress() {
    setPhase("activating");
    setTimeout(() => {
      setPhase("locating");
      requestLocation();
    }, 1600);
  }

  function handleTypeSelect(type: string) {
    setEmergencyType(type);
    const label = EMERGENCY_TYPES.find((t) => t.id === type)?.label || type;
    const priority = PRIORITIES[type] || "MEDIUM";
    setSummary({
      type: label,
      priority,
      location: location
        ? `${location.village}, ${location.district}`
        : "Detecting…",
      description: "",
      evidence: 0,
      timeline: [{ time: now(), event: "Emergency activated" }],
    });
    setPhase("interview");
    setMessages([]);
    setQIndex(0);
    setAnswers([]);
    setEvidenceShown(false);
    setEvidenceDone(false);
    setTimeout(() => {
      const qs = QUESTIONS[type] || QUESTIONS.other;
      streamMessage(
        `I have your location.\n\nNow I need to understand what happened so I can recommend the appropriate response.\n\n${qs[0]}`,
      );
    }, 400);
  }

  function advanceInterview(nextQIdx: number, newAnswers: string[], typeId: string, evShown: boolean) {
    const qs = QUESTIONS[typeId] || QUESTIONS.other;
    if (!evShown && nextQIdx >= 2) {
      setEvidenceShown(true);
      setTimeout(() => {
        streamMessage(
          "If it is safe to do so, you can attach a photo, video or voice recording to help explain the situation.",
          () => {
            setMessages((m) => [
              ...m,
              { id: uid(), role: "ai", text: "", kind: "evidence" },
            ]);
          },
        );
      }, 400);
    } else if (nextQIdx < qs.length) {
      setTimeout(() => streamMessage(qs[nextQIdx]), 400);
    } else {
      setTimeout(() => {
        streamMessage(
          "I've prepared your emergency report. Let me now connect you with the nearest available responders.",
          () => setTimeout(() => setPhase("responders"), 800),
        );
      }, 400);
    }
  }

  function handleUserAnswer() {
    if (!userInput.trim() || isStreaming) return;
    const ans = userInput.trim();
    setUserInput("");
    const newAnswers = [...answers, ans];
    setAnswers(newAnswers);
    setMessages((m) => [...m, { id: uid(), role: "user", text: ans }]);
    const nextQ = qIndex + 1;
    setQIndex(nextQ);
    setSummary((s) => ({
      ...s,
      description: ans,
      timeline: [
        ...s.timeline,
        { time: now(), event: `Info provided: "${ans.slice(0, 30)}${ans.length > 30 ? "…" : ""}"` },
      ],
    }));
    advanceInterview(nextQ, newAnswers, emergencyType, evidenceShown);
  }

  function handleEvidenceAction(action: string) {
    setEvidenceDone(true);
    const text =
      action === "skip"
        ? "No evidence attached"
        : `${action} attached`;
    setMessages((m) => [...m, { id: uid(), role: "user", text }]);
    if (action !== "skip") {
      setSummary((s) => ({
        ...s,
        evidence: s.evidence + 1,
        timeline: [...s.timeline, { time: now(), event: `Evidence attached: ${action}` }],
      }));
    }
    const qs = QUESTIONS[emergencyType] || QUESTIONS.other;
    if (qIndex < qs.length) {
      setTimeout(() => streamMessage(qs[qIndex]), 400);
    } else {
      setTimeout(() => {
        streamMessage(
          "I've prepared your emergency report. Let me now connect you with the nearest available responders.",
          () => setTimeout(() => setPhase("responders"), 800),
        );
      }, 400);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    const ref = `ASA-2026-${String(Math.floor(Math.random() * 900000 + 100000))}`;
    if (user) {
      await supabase.from("reports").insert({
        user_id: user.id,
        report_type: "emergency",
        category: emergencyType,
        title: `Emergency SOS — ${summary.type}`,
        summary: summary.description || "Emergency report submitted via SOS.",
        narrative: answers.join(" | "),
        risk_level:
          summary.priority === "CRITICAL"
            ? "critical"
            : summary.priority === "HIGH"
              ? "high"
              : "medium",
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
        location_text: location
          ? `${location.address}, ${location.district}`
          : "Location unavailable",
      });
    }
    setReference(ref);
    setSubmitting(false);
    setPhase("submitted");
  }

  return (
    <div className="dark fixed inset-0 z-[100] overflow-hidden bg-[#070707]">
      {/* Uganda-inspired ambient gradient */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(180,20,20,0.18) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 110%, rgba(255,185,0,0.10) 0%, transparent 55%)",
        }}
      />

      <AnimatePresence mode="wait">
        {phase === "idle" && (
          <IdleScreen key="idle" onActivate={handleSosPress} />
        )}
        {phase === "activating" && <ActivatingScreen key="activating" />}
        {phase === "locating" && (
          <LocatingScreen
            key="locating"
            location={location}
            locating={locating}
            onReady={() => setPhase("type-select")}
          />
        )}
        {phase === "type-select" && (
          <TypeSelectScreen
            key="type-select"
            location={location}
            onSelect={handleTypeSelect}
          />
        )}
        {phase === "interview" && (
          <InterviewScreen
            key="interview"
            messages={messages}
            streamingText={streamingText}
            isStreaming={isStreaming}
            userInput={userInput}
            setUserInput={setUserInput}
            onSubmit={handleUserAnswer}
            onEvidenceAction={handleEvidenceAction}
            summary={summary}
            emergencyType={emergencyType}
            chatRef={chatRef}
            inputRef={inputRef}
          />
        )}
        {phase === "responders" && (
          <RespondersScreen
            key="responders"
            onContinue={() => setPhase("review")}
          />
        )}
        {phase === "review" && (
          <ReviewScreen
            key="review"
            summary={summary}
            location={location}
            answers={answers}
            emergencyType={emergencyType}
            onSubmit={handleSubmit}
            onEdit={() => setPhase("interview")}
            onCancel={() => setPhase("idle")}
            submitting={submitting}
          />
        )}
        {phase === "submitted" && (
          <SubmittedScreen
            key="submitted"
            reference={reference}
            onContinue={() => setPhase("live")}
          />
        )}
        {phase === "live" && (
          <LiveScreen
            key="live"
            location={location}
            reference={reference}
            summary={summary}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Idle Screen ──────────────────────────────────────────────────────────────

function IdleScreen({ onActivate }: { onActivate: () => void }) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-6 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.35 }}
    >
      <motion.p
        className="mb-3 text-[11px] font-bold uppercase tracking-[0.25em] text-red-400/80"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        Allma Safety AI · Demo Mode
      </motion.p>

      <motion.h1
        className="mb-2 font-display text-3xl font-black text-white"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        Emergency SOS
      </motion.h1>
      <motion.p
        className="mb-14 max-w-xs text-[14px] leading-relaxed text-white/45"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        Tap the button below to activate emergency mode and get immediate
        assistance.
      </motion.p>

      {/* SOS Button */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, type: "spring", stiffness: 260, damping: 20 }}
        className="relative"
      >
        {/* Outer pulse rings */}
        <span className="absolute inset-0 animate-ping rounded-full bg-red-600/20" />
        <span className="absolute -inset-4 animate-ping rounded-full bg-red-600/10 [animation-delay:0.4s]" />

        <button
          onClick={onActivate}
          className="relative h-52 w-52 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-4 focus-visible:ring-offset-[#070707]"
          aria-label="Activate Emergency SOS"
        >
          {/* Ring border */}
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "conic-gradient(from 0deg, #dc2626, #fbbf24 40%, #dc2626 70%, #991b1b)",
              padding: "3px",
            }}
          />
          <span className="absolute inset-[3px] rounded-full bg-[#070707]" />
          {/* Inner button */}
          <span className="absolute inset-[14px] flex items-center justify-center rounded-full bg-gradient-to-br from-red-700 to-red-900 shadow-[0_0_60px_rgba(220,38,38,0.5)]">
            <span className="font-display text-[28px] font-black tracking-[0.18em] text-white">
              SOS
            </span>
          </span>
        </button>
      </motion.div>

      <motion.p
        className="mt-14 text-[12px] text-white/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        Tap once to activate · Demo mode · No real emergency services contacted
      </motion.p>
    </motion.div>
  );
}

// ─── Activating Screen ────────────────────────────────────────────────────────

function ActivatingScreen() {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="flex h-40 w-40 items-center justify-center rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(220,38,38,0.3) 0%, rgba(220,38,38,0) 70%)",
        }}
        animate={{ scale: [1, 1.15, 1], opacity: [1, 0.7, 1] }}
        transition={{ duration: 0.6, repeat: Infinity }}
      >
        <Siren className="h-20 w-20 text-red-500" strokeWidth={1.5} />
      </motion.div>
      <motion.p
        className="mt-8 font-display text-2xl font-black text-white"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        Activating…
      </motion.p>
    </motion.div>
  );
}

// ─── Locating Screen ──────────────────────────────────────────────────────────

function LocatingScreen({
  location,
  locating,
  onReady,
}: {
  location: LocationInfo | null;
  locating: boolean;
  onReady: () => void;
}) {
  const [step, setStep] = useState<"step1" | "step2">("step1");
  const calledReady = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setStep("step2"), 2200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!locating && location && step === "step2" && !calledReady.current) {
      calledReady.current = true;
      const t = setTimeout(onReady, 2600);
      return () => clearTimeout(t);
    }
  }, [locating, location, step, onReady]);

  const mapUrl = location
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${location.lng - 0.012},${location.lat - 0.012},${location.lng + 0.012},${location.lat + 0.012}&layer=mapnik&marker=${location.lat},${location.lng}`
    : null;

  return (
    <motion.div
      className="flex h-full flex-col items-center justify-start overflow-y-auto px-6 pt-16 pb-10"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
    >
      {/* Step 1 */}
      <div className="w-full max-w-sm">
        <motion.div
          className="mb-2 flex items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-[11px] font-black text-white">
            1
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-400">
            Emergency Mode Activated
          </span>
        </motion.div>

        <motion.div
          className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="mb-3 flex items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <Siren className="h-7 w-7 text-red-500" />
            </motion.div>
            <p className="font-display text-lg font-bold text-white">
              🚨 Emergency Mode Activated
            </p>
          </div>
          <p className="text-[14px] leading-relaxed text-white/70">
            Please stay calm. I'm here to help.{" "}
            {locating
              ? "I'm finding the nearest responders based on your location."
              : "Location detected. Identifying nearest responders."}
          </p>

          {locating && (
            <div className="mt-4 flex items-center gap-2 text-[12px] text-amber-400/80">
              <Loader2 className="h-4 w-4 animate-spin" />
              Detecting your location…
            </div>
          )}
        </motion.div>

        {/* Step 2 */}
        <AnimatePresence>
          {step === "step2" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-600 text-[11px] font-black text-white">
                  2
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-400">
                  Your Location
                </span>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
                {location ? (
                  <div className="space-y-2 text-[13px]">
                    {[
                      ["Address", location.address],
                      ["Village / Area", location.village],
                      ["District", location.district],
                      ["Region", location.region],
                      ["GPS", `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-start gap-3">
                        <span className="min-w-[80px] text-white/40">{k}</span>
                        <span className="font-medium text-white/90">{v}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[13px] text-white/50">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Detecting address…
                  </div>
                )}

                {/* Live map */}
                {mapUrl && (
                  <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
                    <iframe
                      src={mapUrl}
                      title="Live Location Map"
                      className="h-44 w-full"
                      style={{ filter: "invert(0.88) hue-rotate(180deg)" }}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Type Select Screen ───────────────────────────────────────────────────────

function TypeSelectScreen({
  location,
  onSelect,
}: {
  location: LocationInfo | null;
  onSelect: (type: string) => void;
}) {
  return (
    <motion.div
      className="flex h-full flex-col overflow-y-auto px-5 pt-14 pb-10"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
    >
      <div className="mx-auto w-full max-w-lg">
        {location && (
          <motion.div
            className="mb-5 flex items-center gap-2 rounded-xl border border-green-800/50 bg-green-950/40 px-4 py-2.5 text-[12px] text-green-400"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <MapPin className="h-4 w-4 shrink-0" />
            <span>
              Location confirmed:{" "}
              <strong>
                {location.village}, {location.district}
              </strong>
            </span>
          </motion.div>
        )}

        <motion.div
          className="mb-1 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-red-400">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white">
              3
            </span>
            Step 3
          </div>
          <p className="text-[15px] leading-relaxed text-white/85">
            I have your location. Now I need to understand what happened so I
            can recommend the appropriate response.{" "}
            <strong className="text-white">Please choose the emergency type.</strong>
          </p>
        </motion.div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {EMERGENCY_TYPES.map((et, i) => (
            <motion.button
              key={et.id}
              onClick={() => onSelect(et.id)}
              className="group flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur-md transition-all hover:border-red-700/60 hover:bg-red-950/40 active:scale-95"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.05 }}
              whileTap={{ scale: 0.96 }}
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

// ─── Interview Screen ─────────────────────────────────────────────────────────

function InterviewScreen({
  messages,
  streamingText,
  isStreaming,
  userInput,
  setUserInput,
  onSubmit,
  onEvidenceAction,
  summary,
  emergencyType,
  chatRef,
  inputRef,
}: {
  messages: Msg[];
  streamingText: string;
  isStreaming: boolean;
  userInput: string;
  setUserInput: (v: string) => void;
  onSubmit: () => void;
  onEvidenceAction: (action: string) => void;
  summary: IncidentSummary;
  emergencyType: string;
  chatRef: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const typeInfo = EMERGENCY_TYPES.find((t) => t.id === emergencyType);
  const lastMsgIsEvidence =
    messages.length > 0 && messages[messages.length - 1].kind === "evidence";
  const showInput = !isStreaming && !lastMsgIsEvidence;

  return (
    <motion.div
      className="flex h-full flex-col lg:flex-row"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.4 }}
    >
      {/* Chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#0d0d0d]/80 px-5 py-4 backdrop-blur-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-950/60 text-2xl">
            {typeInfo?.icon}
          </div>
          <div className="flex-1">
            <p className="font-display text-[15px] font-bold text-white">
              {typeInfo?.label || "Emergency"}
            </p>
            <p className="flex items-center gap-1.5 text-[11px] text-red-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              Emergency Active
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${priorityColor(summary.priority)}`}
          >
            {summary.priority}
          </span>
        </div>

        {/* Messages */}
        <div
          ref={chatRef}
          className="flex-1 overflow-y-auto px-4 py-5"
          style={{ scrollBehavior: "smooth" }}
        >
          <div className="mx-auto max-w-xl space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((msg) =>
                msg.kind === "evidence" ? (
                  <EvidenceCard key={msg.id} onAction={onEvidenceAction} />
                ) : (
                  <motion.div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div
                      className={`max-w-[82%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed ${
                        msg.role === "user"
                          ? "rounded-br-sm bg-red-700 text-white"
                          : "rounded-bl-sm border border-white/10 bg-white/8 text-white/90"
                      }`}
                      style={{ whiteSpace: "pre-wrap" }}
                    >
                      {msg.text}
                    </div>
                  </motion.div>
                ),
              )}

              {/* Streaming bubble */}
              {streamingText && (
                <motion.div
                  className="flex justify-start"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  key="streaming"
                >
                  <div
                    className="max-w-[82%] rounded-2xl rounded-bl-sm border border-white/10 bg-white/8 px-4 py-3 text-[14px] leading-relaxed text-white/90"
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    {streamingText}
                    <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-white/60" />
                  </div>
                </motion.div>
              )}

              {/* Typing indicator */}
              {isStreaming && !streamingText && (
                <motion.div
                  className="flex justify-start"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  key="typing"
                >
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-white/10 bg-white/8 px-4 py-3">
                    {[0, 0.15, 0.3].map((d, i) => (
                      <span
                        key={i}
                        className="inline-block h-2 w-2 animate-bounce rounded-full bg-white/50"
                        style={{ animationDelay: `${d}s` }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Input */}
        <AnimatePresence>
          {showInput && (
            <motion.div
              className="shrink-0 border-t border-white/10 bg-[#0d0d0d]/80 p-4 backdrop-blur-md"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <div className="mx-auto flex max-w-xl items-end gap-3">
                <input
                  ref={inputRef}
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onSubmit()}
                  placeholder="Type your answer…"
                  className="flex-1 rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-[14px] text-white outline-none placeholder:text-white/30 focus:border-red-600/60 focus:bg-white/10"
                />
                <button
                  onClick={onSubmit}
                  disabled={!userInput.trim()}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-red-700 text-white transition-opacity hover:bg-red-600 disabled:opacity-40"
                  aria-label="Send"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Summary panel (desktop) */}
      <SummaryPanel summary={summary} />
    </motion.div>
  );
}

function EvidenceCard({ onAction }: { onAction: (a: string) => void }) {
  const options = [
    { icon: Camera, label: "📷 Camera" },
    { icon: Video, label: "🎥 Video" },
    { icon: Mic, label: "🎤 Voice" },
    { icon: FileText, label: "📄 Document" },
    { icon: Navigation2, label: "📍 Location" },
  ];

  return (
    <motion.div
      className="flex justify-start"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-amber-800/40 bg-amber-950/30 p-4">
        <p className="mb-3 text-[13px] leading-relaxed text-white/85">
          If it is safe to do so, you can attach a photo, video or voice
          recording to help explain the situation.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {options.map(({ label }) => (
            <button
              key={label}
              onClick={() => onAction(label)}
              className="rounded-xl border border-white/10 bg-white/8 px-2 py-2.5 text-center text-[11px] font-medium text-white/80 transition-all hover:border-amber-600/50 hover:bg-amber-950/40 active:scale-95"
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => onAction("skip")}
            className="col-span-3 flex items-center justify-center gap-1.5 rounded-xl border border-white/8 py-2 text-[11px] text-white/40 transition-all hover:text-white/60"
          >
            <SkipForward className="h-3 w-3" />
            Skip for now
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function SummaryPanel({ summary }: { summary: IncidentSummary }) {
  return (
    <div className="hidden shrink-0 w-72 flex-col overflow-y-auto border-l border-white/10 bg-[#0d0d0d]/60 p-5 backdrop-blur-md lg:flex xl:w-80">
      <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
        Incident Summary
      </p>

      <div className="space-y-3 text-[12px]">
        {summary.type && (
          <Row label="Type" value={summary.type} />
        )}
        {summary.priority && (
          <div className="flex items-center justify-between">
            <span className="text-white/40">Priority</span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${priorityColor(summary.priority)}`}
            >
              {summary.priority}
            </span>
          </div>
        )}
        {summary.location && (
          <Row label="Location" value={summary.location} />
        )}
        {summary.description && (
          <Row
            label="Latest info"
            value={
              summary.description.length > 60
                ? summary.description.slice(0, 60) + "…"
                : summary.description
            }
          />
        )}
        {summary.evidence > 0 && (
          <Row label="Evidence" value={`${summary.evidence} item(s)`} />
        )}
      </div>

      {summary.timeline.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
            Timeline
          </p>
          <div className="space-y-2.5">
            {summary.timeline.map((t, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0 text-[10px] tabular-nums text-white/30">
                  {t.time}
                </span>
                <span className="text-[11px] text-white/60">{t.event}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-white/40">{label}</span>
      <span className="text-right font-medium text-white/80">{value}</span>
    </div>
  );
}

// ─── Responders Screen ────────────────────────────────────────────────────────

function RespondersScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <motion.div
      className="flex h-full flex-col overflow-y-auto px-5 pt-14 pb-10"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
    >
      <div className="mx-auto w-full max-w-sm">
        <motion.div
          className="mb-2 flex items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-[11px] font-black text-white">
            7
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-400">
            Nearest Responders
          </span>
        </motion.div>

        <motion.p
          className="mb-5 text-[14px] leading-relaxed text-white/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          Based on your location, these officers are available to respond.
        </motion.p>

        <div className="space-y-3">
          {DEMO_OFFICERS.map((officer, i) => (
            <motion.div
              key={officer.name}
              className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.1 }}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-950/60">
                  <User className="h-5 w-5 text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-white">{officer.name}</p>
                  <p className="flex items-center gap-1.5 text-[12px] text-white/50">
                    <MapPin className="h-3 w-3" />
                    {officer.station}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    officer.available
                      ? "bg-green-950/60 text-green-400"
                      : "bg-amber-950/60 text-amber-400"
                  }`}
                >
                  {officer.status}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3">
                <div className="flex items-center gap-1.5 text-[12px] text-white/50">
                  <Clock className="h-3.5 w-3.5" />
                  ETA: <strong className="text-white/80">{officer.eta}</strong>
                </div>
                <a
                  href={`tel:${officer.phone.replace(/\s/g, "")}`}
                  className="flex items-center gap-1.5 rounded-xl bg-red-950/60 px-3 py-1.5 text-[11px] font-semibold text-red-400 transition-colors hover:bg-red-900/60"
                >
                  <Phone className="h-3.5 w-3.5" />
                  Call
                </a>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.p
          className="mt-4 text-center text-[10px] text-white/25"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Demo data only. Officer names and details are fictional.
        </motion.p>

        <motion.button
          onClick={onContinue}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-700 py-4 font-display text-[15px] font-bold text-white transition-colors hover:bg-red-600"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          whileTap={{ scale: 0.98 }}
        >
          Review & Submit Report
          <ChevronRight className="h-5 w-5" />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Review Screen ────────────────────────────────────────────────────────────

function ReviewScreen({
  summary,
  location,
  answers,
  emergencyType,
  onSubmit,
  onEdit,
  onCancel,
  submitting,
}: {
  summary: IncidentSummary;
  location: LocationInfo | null;
  answers: string[];
  emergencyType: string;
  onSubmit: () => void;
  onEdit: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const typeInfo = EMERGENCY_TYPES.find((t) => t.id === emergencyType);

  return (
    <motion.div
      className="flex h-full flex-col overflow-y-auto px-5 pt-14 pb-10"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
    >
      <div className="mx-auto w-full max-w-sm">
        <motion.div
          className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <p className="mb-4 font-display text-base font-bold text-white">
            I've prepared your emergency report. Please review the summary below.
          </p>

          <div className="space-y-3 text-[13px]">
            <ReviewRow icon="🚨" label="Emergency Type" value={typeInfo?.label || emergencyType} />
            <ReviewRow
              icon="⚠️"
              label="Priority"
              value={
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${priorityColor(summary.priority)}`}
                >
                  {summary.priority}
                </span>
              }
            />
            {location && (
              <ReviewRow
                icon="📍"
                label="Location"
                value={`${location.address}, ${location.district}`}
              />
            )}
            {answers.length > 0 && (
              <ReviewRow
                icon="📝"
                label="Description"
                value={answers.slice(0, 2).join(". ").slice(0, 120) + "…"}
              />
            )}
            {summary.evidence > 0 && (
              <ReviewRow
                icon="📷"
                label="Evidence"
                value={`${summary.evidence} item(s) attached`}
              />
            )}
            <ReviewRow
              icon="🚔"
              label="Responders"
              value="3 nearest officers identified"
            />
          </div>
        </motion.div>

        <motion.div
          className="flex flex-col gap-2.5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-700 py-4 font-display text-[15px] font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )}
            {submitting ? "Submitting…" : "Submit Report"}
          </button>

          <button
            onClick={onEdit}
            className="w-full rounded-2xl border border-white/12 py-3.5 text-[13px] font-medium text-white/60 transition-colors hover:border-white/20 hover:text-white/80"
          >
            Edit Report
          </button>

          <button
            onClick={onCancel}
            className="w-full rounded-2xl py-3 text-[12px] text-white/30 transition-colors hover:text-white/50"
          >
            Cancel Emergency
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

function ReviewRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-t border-white/8 pt-3 first:border-0 first:pt-0">
      <span className="mt-0.5 shrink-0 text-base">{icon}</span>
      <div className="flex-1">
        <p className="text-[10px] uppercase tracking-[0.12em] text-white/35">{label}</p>
        <div className="mt-0.5 font-medium text-white/85">{value}</div>
      </div>
    </div>
  );
}

// ─── Submitted Screen ─────────────────────────────────────────────────────────

function SubmittedScreen({
  reference,
  onContinue,
}: {
  reference: string | null;
  onContinue: () => void;
}) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-6 text-center"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, type: "spring", stiffness: 260, damping: 20 }}
    >
      <motion.div
        className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-green-950/60"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: "spring" }}
      >
        <CheckCircle2 className="h-12 w-12 text-green-400" />
      </motion.div>

      <motion.h2
        className="mb-2 font-display text-2xl font-black text-white"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        ✅ Emergency Report Submitted
      </motion.h2>

      {reference && (
        <motion.div
          className="mb-3 rounded-xl border border-white/10 bg-white/5 px-5 py-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            Reference Number
          </p>
          <p className="mt-1 font-display text-xl font-black tracking-wide text-amber-400">
            {reference}
          </p>
        </motion.div>
      )}

      <motion.p
        className="mb-10 max-w-xs text-[14px] leading-relaxed text-white/55"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        The nearest responding team has been notified. Remain in this chat for
        updates.
      </motion.p>

      <motion.button
        onClick={onContinue}
        className="flex items-center gap-2 rounded-2xl bg-red-700 px-8 py-4 font-display font-bold text-white hover:bg-red-600"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        whileTap={{ scale: 0.97 }}
      >
        Open Live Emergency Screen
        <ChevronRight className="h-5 w-5" />
      </motion.button>
    </motion.div>
  );
}

// ─── Live Screen ──────────────────────────────────────────────────────────────

function LiveScreen({
  location,
  reference,
  summary,
}: {
  location: LocationInfo | null;
  reference: string | null;
  summary: IncidentSummary;
}) {
  const mapUrl = location
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${location.lng - 0.018},${location.lat - 0.018},${location.lng + 0.018},${location.lat + 0.018}&layer=mapnik&marker=${location.lat},${location.lng}`
    : null;

  const actions = [
    { icon: Phone, label: "📞 Call Demo Officer", href: "tel:+256774620951" },
    { icon: Navigation2, label: "📍 Share Updated Location", href: "#" },
    { icon: Radio, label: "💬 Continue Chat", href: "/chat" },
    { icon: Camera, label: "📷 Upload More Evidence", href: "#" },
  ];

  return (
    <motion.div
      className="flex h-full flex-col overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="shrink-0 border-b border-white/10 bg-[#0d0d0d]/80 px-5 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="flex items-center gap-2 font-display text-[15px] font-bold text-white">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
              Live Emergency Screen
            </p>
            {reference && (
              <p className="text-[11px] text-amber-400">Ref: {reference}</p>
            )}
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${priorityColor(summary.priority)}`}
          >
            {summary.priority}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto max-w-sm space-y-4">
          {/* Map */}
          <div className="overflow-hidden rounded-2xl border border-white/10">
            {mapUrl ? (
              <iframe
                src={mapUrl}
                title="Live Location"
                className="h-52 w-full"
                style={{ filter: "invert(0.88) hue-rotate(180deg)" }}
              />
            ) : (
              <div className="flex h-52 items-center justify-center bg-white/5 text-[13px] text-white/40">
                <MapPin className="mr-2 h-5 w-5" /> Map loading…
              </div>
            )}
            <div className="bg-white/5 px-4 py-2.5">
              <p className="flex items-center gap-2 text-[12px] text-white/60">
                <MapPin className="h-3.5 w-3.5 text-red-400" />
                {location
                  ? `${location.address}, ${location.district}`
                  : "Location unavailable"}
              </p>
            </div>
          </div>

          {/* Responders mini */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
              🚔 Demo Responders
            </p>
            <div className="space-y-2">
              {DEMO_OFFICERS.map((o) => (
                <div
                  key={o.name}
                  className="flex items-center justify-between text-[12px]"
                >
                  <span className="text-white/75">{o.name}</span>
                  <span className="flex items-center gap-2">
                    <span
                      className={o.available ? "text-green-400" : "text-amber-400"}
                    >
                      {o.status}
                    </span>
                    <span className="text-white/35">ETA {o.eta}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2.5">
            {actions.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-4 text-center text-[12px] font-medium text-white/70 transition-all hover:border-red-700/50 hover:bg-red-950/30 hover:text-white active:scale-95"
              >
                {label}
              </a>
            ))}
          </div>

          {/* Timeline */}
          {summary.timeline.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                Emergency Timeline
              </p>
              <div className="space-y-3">
                {summary.timeline.map((t, i) => (
                  <div key={i} className="flex items-start gap-3 text-[12px]">
                    <span className="shrink-0 tabular-nums text-white/30">
                      {t.time}
                    </span>
                    <div className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                      <span className="text-white/65">{t.event}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="py-2 text-center text-[10px] text-white/20">
            Demo mode · All responder data is fictional · Always call real emergency services
          </p>
        </div>
      </div>
    </motion.div>
  );
}
