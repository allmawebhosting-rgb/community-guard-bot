import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { toast } from "sonner";
import {
  AlertCircle,
  Ambulance,
  Camera,
  CheckCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  Flame,
  HelpCircle,
  Hospital,
  Loader2,
  MapPin,
  Megaphone,
  Mic,
  Paperclip,
  Phone,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  Siren,
  Sparkles,
  Upload,
  User,
  Video,
  FileAudio,
  FileIcon,
  Navigation,
  X,
} from "lucide-react";

import { motion, AnimatePresence } from "motion/react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { InputGroupAddon } from "@/components/ui/input-group";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { AssistantHero } from "@/components/allma/assistant-hero";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type ToolPart = {
  type: string;
  state?: string;
  output?: unknown;
};

type Suggestion = { label: string; prompt: string };

const DEFAULT_MEDIA_TIPS: Record<string, string> = {
  photo: "Good light · Show the whole scene · Up to 4 photos",
  video: "Keep it short · Hold steady · Capture the surroundings",
  audio: "Speak clearly · Quiet spot if you can",
  document: "PDF or photo of the document is fine",
  location: "Shares your GPS position with responders",
};

const MEDIA_ICONS: Record<string, typeof Camera> = {
  photo: Camera,
  video: Video,
  audio: FileAudio,
  document: FileIcon,
  location: Navigation,
};

const FLOW_ICONS: Record<string, typeof ShieldAlert> = {
  reporting: ShieldAlert,
  "missing person": User,
  "lost & found": Search,
  "safety check": Shield,
  emergency: Siren,
};

const IDLE_CHIPS: Suggestion[] = [
  { label: "Report a crime", prompt: "I want to report a crime" },
  { label: "Find help nearby", prompt: "Find help near me" },
  { label: "Emergency numbers", prompt: "Show me the emergency numbers" },
];

const STEP_FALLBACK_CHIPS: Array<{ matches: RegExp; chips: Suggestion[] }> = [
  {
    matches: /safe|danger|immediate|threat/i,
    chips: [
      { label: "Yes, I'm safe", prompt: "Yes, I'm safe" },
      { label: "No, I'm in danger", prompt: "No, I'm in danger" },
      { label: "I'm not sure", prompt: "I'm not sure if I'm safe" },
    ],
  },
  {
    matches: /photo|video|evidence|attach|upload/i,
    chips: [
      { label: "Attach a photo", prompt: "I'd like to attach a photo" },
      { label: "I have a video", prompt: "I have a video to attach" },
      { label: "Skip for now", prompt: "Skip for now" },
    ],
  },
  {
    matches: /where|location|place|area|happen/i,
    chips: [
      { label: "Share my location", prompt: "Share my current location" },
      { label: "Type the location", prompt: "I'll type the location" },
      { label: "I'm not sure", prompt: "I'm not sure of the exact location" },
    ],
  },
  {
    matches: /when|time|date|last seen/i,
    chips: [
      { label: "Today", prompt: "It happened today" },
      { label: "Yesterday", prompt: "It happened yesterday" },
      { label: "I'm not sure", prompt: "I'm not sure when it happened" },
    ],
  },
];

const QUICK_ACTIONS: Array<{ label: string; prompt: string; icon: typeof Camera }> = [
  { label: "Report a crime", prompt: "I want to report a crime", icon: ShieldAlert },
  { label: "Missing person", prompt: "I want to report a missing person", icon: User },
  { label: "Lost & found", prompt: "I lost something and want to report it", icon: Search },
  { label: "Find help nearby", prompt: "Find help near me", icon: MapPin },
];

function FlowBanner({
  flowLabel,
  stepTitle,
  step,
  total,
  helper,
}: {
  flowLabel: string;
  stepTitle: string;
  step: number;
  total: number;
  helper?: string | null;
}) {
  const pct = Math.min(100, (step / Math.max(total, 1)) * 100);
  const FlowIcon = FLOW_ICONS[flowLabel.trim().toLowerCase()] ?? ShieldAlert;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="chat-card relative overflow-hidden p-3.5"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-gold shadow-soft">
          <FlowIcon className="h-4.5 w-4.5 text-primary-foreground" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            {flowLabel}
            <span className="text-muted-foreground/70">
              {" "}
              · STEP {step} OF {total}
            </span>
          </p>
          <h4 className="truncate text-[15px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
            {stepTitle}
          </h4>
          {helper ? (
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{helper}</p>
          ) : null}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-border/40">
        <motion.div
          className="h-full bg-gradient-to-r from-primary via-primary-glow to-gold"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </motion.div>
  );
}

const ATTACHMENT_OPTIONS = [
  {
    id: "camera",
    icon: Camera,
    label: "Camera",
    accept: "image/*",
    capture: "environment" as const,
  },
  { id: "gallery", icon: Paperclip, label: "Gallery", accept: "image/*", capture: undefined },
  { id: "video", icon: Video, label: "Video", accept: "video/*", capture: undefined },
  { id: "voice", icon: FileAudio, label: "Voice", accept: "audio/*", capture: undefined },
  {
    id: "document",
    icon: FileIcon,
    label: "Document",
    accept: "application/pdf,.doc,.docx",
    capture: undefined,
  },
];

type Attachment = {
  id: string;
  name: string;
  mediaType: string;
  url: string;
  preview: string;
};

const ACTION_ICONS: Record<string, typeof FileText> = {
  phone: Phone,
  upload: Upload,
  location: MapPin,
  block: ShieldAlert,
  report: FileText,
  search: Search,
  ambulance: Ambulance,
  police: Shield,
  money: CreditCard,
  shield: Shield,
  sim: CreditCard,
};

function ToolCard({
  part,
  onSend,
  onOpenAttach,
  onShareLocation,
}: {
  part: ToolPart;
  onSend: (text: string) => void;
  onOpenAttach?: () => void;
  onShareLocation?: () => void;
}) {
  const name = part.type.replace(/^tool-/, "");
  const running = part.state !== "output-available" && part.state !== "output-error";
  const output = part.output as Record<string, unknown> | undefined;

  const meta: Record<string, { icon: typeof FileText; label: string; busy: string }> = {
    create_report: { icon: FileText, label: "Incident report", busy: "Filing your report…" },
    find_facilities: { icon: MapPin, label: "Nearby help", busy: "Searching the directory…" },
    list_alerts: { icon: Megaphone, label: "Community alerts", busy: "Checking alerts…" },
    ask_structured_question: { icon: HelpCircle, label: "Question", busy: "Preparing question…" },
    request_media: { icon: Upload, label: "Upload evidence", busy: "Preparing upload…" },
    recommend_actions: {
      icon: AlertCircle,
      label: "Recommended actions",
      busy: "Finding recommendations…",
    },
    report_summary: { icon: FileText, label: "Report summary", busy: "Preparing summary…" },
    my_reports: { icon: FileText, label: "Your reports", busy: "Checking your reports…" },
    match_reports: { icon: Search, label: "Possible matches", busy: "Looking for matches…" },
    recall_history: {
      icon: Search,
      label: "Earlier conversations",
      busy: "Recalling earlier chats…",
    },
    remember: { icon: Shield, label: "Saved", busy: "Noting that down…" },
    save_draft: { icon: FileText, label: "Draft saved", busy: "Saving your draft…" },
    get_draft: { icon: FileText, label: "Saved draft", busy: "Loading your draft…" },
    location_intelligence: {
      icon: MapPin,
      label: "Location intelligence",
      busy: "Identifying responsible station…",
    },
    case_timeline: { icon: Clock, label: "Case timeline", busy: "Building timeline…" },
  };
  const entry = meta[name] ?? { icon: FileText, label: name, busy: "Working…" };
  const Icon = entry.icon;

  // Silent background tools — no card once they finish.
  if (name === "suggest_replies") {
    return null;
  }

  if (!running && (name === "remember" || name === "recall_history" || name === "get_draft")) {
    return null;
  }

  if (running) {
    return (
      <div className="chat-card p-3">
        <Shimmer className="text-sm">{entry.busy}</Shimmer>
      </div>
    );
  }

  // Custom interactive cards for the redesigned AI flows
  if (name === "ask_structured_question" && output?.ok) {
    const step = Number(output.step ?? 1);
    const total = Number(output.total_steps ?? 5);
    const question = String(output.question ?? "");
    const helper = output.helper_text ? String(output.helper_text) : null;
    const flowLabel = String(output.flow_label ?? "Reporting");
    const stepTitle = String(output.step_title ?? question);

    return (
      <FlowBanner
        flowLabel={flowLabel}
        stepTitle={stepTitle}
        step={step}
        total={total}
        helper={helper}
      />
    );
  }

  if (name === "request_media" && output?.ok) {
    const prompt = String(output.prompt ?? "Please upload a photo or file.");
    const mediaType = String(output.media_type ?? "photo");
    const tips = output.tips ? String(output.tips) : (DEFAULT_MEDIA_TIPS[mediaType] ?? null);
    const optional = Boolean(output.optional);
    const isLocation = mediaType === "location";
    const MediaIcon = MEDIA_ICONS[mediaType] ?? Camera;

    return (
      <div className="space-y-2">
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          whileHover={{ scale: 1.005 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => (isLocation ? onShareLocation?.() : onOpenAttach?.())}
          className="flex w-full items-center gap-3 rounded-[1.25rem] border border-gold/35 bg-gold/[0.08] px-4 py-3.5 text-left transition-colors hover:border-gold/60 hover:bg-gold/[0.14]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold to-primary shadow-soft">
            <MediaIcon className="h-5 w-5 text-primary-foreground" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">{prompt}</span>
            {tips ? (
              <span className="block truncate text-xs text-muted-foreground">{tips}</span>
            ) : null}
          </span>
        </motion.button>
        {optional ? (
          <button
            type="button"
            onClick={() => onSend("Skip for now")}
            className="rounded-full border border-border/50 px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-primary/45 hover:bg-accent"
          >
            Skip for now
          </button>
        ) : null}
      </div>
    );
  }

  if (name === "recommend_actions" && output?.ok) {
    const title = String(output.title ?? "Recommended actions");
    const actions = Array.isArray(output.actions) ? output.actions : [];

    return (
      <div className="chat-card p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {actions.map(
            (action: { label: string; subtitle: string; icon?: string }, index: number) => {
              const ActionIcon = ACTION_ICONS[action.icon ?? "shield"] ?? Shield;
              return (
                <motion.button
                  key={index}
                  type="button"
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onSend(action.label)}
                  className="flex items-start gap-3 rounded-2xl border border-border/50 bg-background/40 p-3.5 text-left transition-all hover:border-primary/45 hover:bg-accent"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <ActionIcon className="h-4 w-4 text-primary" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{action.label}</p>
                    <p className="text-xs text-muted-foreground">{action.subtitle}</p>
                  </div>
                </motion.button>
              );
            },
          )}
        </div>
      </div>
    );
  }

  if (name === "report_summary" && output?.ok) {
    const summary = {
      reportType: String(output.report_type ?? ""),
      category: String(output.category ?? ""),
      title: String(output.title ?? ""),
      summary: String(output.summary ?? ""),
      occurredAt: output.occurred_at_text ? String(output.occurred_at_text) : null,
      location: output.location_text ? String(output.location_text) : null,
      risk: String(output.risk_level ?? ""),
      anonymous: Boolean(output.is_anonymous),
    };

    return (
      <div className="chat-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Review before submitting
          </p>
        </div>
        <h4 className="mb-1 text-sm font-semibold text-foreground">{summary.title}</h4>
        <p className="mb-3 text-xs text-muted-foreground">{summary.summary}</p>
        <div className="mb-3 space-y-1.5 rounded-2xl border border-border/50 bg-background/40 p-3.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Category</span>
            <span className="font-medium text-foreground">{summary.category}</span>
          </div>
          {summary.occurredAt ? (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Date / time</span>
              <span className="font-medium text-foreground">{summary.occurredAt}</span>
            </div>
          ) : null}
          {summary.location ? (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Location</span>
              <span className="font-medium text-foreground">{summary.location}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Risk level</span>
            <span className="font-medium text-foreground">{summary.risk}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Anonymous</span>
            <span className="font-medium text-foreground">{summary.anonymous ? "Yes" : "No"}</span>
          </div>
        </div>
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          Your data is encrypted and shared only with verified responders.
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSend("I need to edit this report")}
            className="rounded-full border border-border/50 px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-primary/45 hover:bg-accent"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onSend("Confirm and submit this report")}
            className="rounded-full bg-gradient-to-r from-primary to-primary-glow px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:opacity-90"
          >
            Confirm & Submit
          </button>
        </div>
      </div>
    );
  }

  // ── location_intelligence card ──────────────────────────────
  if (name === "location_intelligence" && output?.ok) {
    const area = String(output.area ?? "");
    const policeStation = output.police_station as Record<string, unknown> | null;
    const hospital = output.hospital as Record<string, unknown> | null;
    const fireStation = output.fire_station as Record<string, unknown> | null;

    type FacilityCardProps = {
      icon: typeof MapPin;
      iconColor: string;
      iconBg: string;
      label: string;
      name: string;
      address: string;
      distanceKm: string;
      estimatedMinutes: number;
      phone?: string;
      status?: string;
    };
    const FacilityCard = ({
      icon: FIcon,
      iconColor,
      iconBg,
      label,
      name: facName,
      address,
      distanceKm,
      estimatedMinutes,
      phone,
      status,
    }: FacilityCardProps) => (
      <div className="rounded-2xl border border-border/50 bg-background/40 p-3.5">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconBg}`}
            >
              <FIcon className={`h-4 w-4 ${iconColor}`} />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {label}
              </p>
              <p className="text-sm font-semibold text-foreground leading-tight">{facName}</p>
            </div>
          </div>
          {status ? (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              {status}
            </span>
          ) : null}
        </div>
        {address ? <p className="mb-2 text-xs text-muted-foreground">{address}</p> : null}
        <div className="mb-2.5 flex gap-3 text-xs">
          <span className="flex items-center gap-1 text-foreground font-medium">
            <MapPin className="h-3 w-3 text-primary" />
            {distanceKm} km
          </span>
          <span className="flex items-center gap-1 text-foreground font-medium">
            <Clock className="h-3 w-3 text-primary" />
            {estimatedMinutes} min
          </span>
        </div>
        {phone ? (
          <a
            href={`tel:${phone}`}
            className="flex items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90"
          >
            <Phone className="h-3.5 w-3.5" /> Call {facName}
          </a>
        ) : null}
      </div>
    );

    return (
      <div className="chat-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Location Intelligence · {area}
          </p>
        </div>
        {policeStation ? (
          <p className="mb-3 text-sm text-foreground">
            This incident falls under{" "}
            <span className="font-semibold">{String(policeStation.name ?? "a local station")}</span>
            .
          </p>
        ) : null}
        <div className="space-y-2">
          {policeStation ? (
            <FacilityCard
              icon={Siren}
              iconColor="text-blue-600 dark:text-blue-400"
              iconBg="bg-blue-500/10"
              label="Responsible Station"
              name={String(policeStation.name ?? "Police Station")}
              address={String(policeStation.address ?? policeStation.district ?? "")}
              distanceKm={String(policeStation.distance_km ?? "—")}
              estimatedMinutes={Number(policeStation.estimated_minutes ?? 0)}
              phone={policeStation.phone ? String(policeStation.phone) : undefined}
              status={String(policeStation.status ?? "Available")}
            />
          ) : null}
          {hospital ? (
            <FacilityCard
              icon={Hospital}
              iconColor="text-emerald-600 dark:text-emerald-400"
              iconBg="bg-emerald-500/10"
              label="Nearest Hospital"
              name={String(hospital.name ?? "Hospital")}
              address={String(hospital.address ?? hospital.district ?? "")}
              distanceKm={String(hospital.distance_km ?? "—")}
              estimatedMinutes={Number(hospital.estimated_minutes ?? 0)}
              phone={hospital.phone ? String(hospital.phone) : undefined}
            />
          ) : null}
          {fireStation ? (
            <FacilityCard
              icon={Flame}
              iconColor="text-orange-600 dark:text-orange-400"
              iconBg="bg-orange-500/10"
              label="Nearest Fire Station"
              name={String(fireStation.name ?? "Fire Station")}
              address={String(fireStation.address ?? fireStation.district ?? "")}
              distanceKm={String(fireStation.distance_km ?? "—")}
              estimatedMinutes={Number(fireStation.estimated_minutes ?? 0)}
              phone={fireStation.phone ? String(fireStation.phone) : undefined}
            />
          ) : null}
          {!policeStation && !hospital && !fireStation ? (
            <p className="text-sm text-muted-foreground">
              No facilities found for this area yet. You can search by a different area or call the
              national emergency line: 999 / 112.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  // ── case_timeline card ───────────────────────────────────────
  if (name === "case_timeline" && output?.ok) {
    const events = Array.isArray(output.events) ? (output.events as Array<{ label: string }>) : [];
    const generatedAt = output.generated_at ? new Date(String(output.generated_at)) : new Date();

    const baseTime = new Date(generatedAt.getTime() - events.length * 90000);

    return (
      <div className="chat-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Case Timeline
          </p>
        </div>
        <div className="relative pl-5">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border/60" />
          {events.map((evt, i) => {
            const t = new Date(baseTime.getTime() + i * 90000);
            const hh = String(t.getHours()).padStart(2, "0");
            const mm = String(t.getMinutes()).padStart(2, "0");
            const isLast = i === events.length - 1;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.07, duration: 0.3 }}
                className="relative mb-3 last:mb-0"
              >
                <span
                  className={cn(
                    "absolute -left-5 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2",
                    isLast ? "border-primary bg-primary" : "border-border/60 bg-background",
                  )}
                />
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {hh}:{mm}
                  </span>
                  <span
                    className={cn(
                      "text-[13px]",
                      isLast ? "font-semibold text-foreground" : "text-foreground/80",
                    )}
                  >
                    {evt.label}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-card p-3.5">
      <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" /> {entry.label}
      </p>
      {name === "create_report" && output?.ok ? (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <p className="text-sm font-semibold text-foreground">
              {String(output.title ?? "Report filed successfully")}
            </p>
          </div>
          <div className="mb-3 rounded-2xl border border-border/50 bg-background/40 p-3.5 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Reference number</span>
              <span className="font-mono font-semibold text-foreground">
                {String(output.reference)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Status</span>
              <span className="capitalize font-medium text-foreground">
                {String(output.status)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Risk level</span>
              <span
                className={cn(
                  "capitalize font-semibold",
                  output.risk_level === "critical"
                    ? "text-destructive"
                    : output.risk_level === "high"
                      ? "text-orange-500"
                      : output.risk_level === "medium"
                        ? "text-yellow-500"
                        : "text-emerald-500",
                )}
              >
                {String(output.risk_level)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            The responsible station has been notified. Keep your reference number safe.
          </div>
        </div>
      ) : name === "find_facilities" && Array.isArray(output?.facilities) ? (
        <div className="space-y-2.5">
          {(output.facilities as Array<Record<string, unknown>>).map((facility, index) => (
            <div key={index} className="rounded-2xl border border-border/50 bg-background/40 p-3.5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{String(facility.name)}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(facility.address ?? facility.district ?? "")}
                  </p>
                </div>
                {facility.phone ? (
                  <a
                    href={`tel:${facility.phone}`}
                    className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90"
                  >
                    <Phone className="h-3 w-3" /> Call
                  </a>
                ) : null}
              </div>
              {facility.phone ? (
                <p className="text-xs text-muted-foreground font-mono">{String(facility.phone)}</p>
              ) : null}
            </div>
          ))}
          {(output.facilities as unknown[]).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No facilities found for this area. Try a different area name.
            </p>
          ) : null}
        </div>
      ) : name === "list_alerts" && Array.isArray(output?.alerts) ? (
        <ul className="space-y-2 text-sm">
          {(output.alerts as Array<Record<string, unknown>>).map((alert, index) => (
            <li key={index} className="rounded-xl border border-border/50 bg-background/30 p-3">
              <span className="block font-medium text-foreground">{String(alert.title)}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {String(alert.area ?? "")} · {String(alert.severity)}
              </span>
              {alert.body ? (
                <span className="block text-xs text-muted-foreground mt-1">
                  {String(alert.body)}
                </span>
              ) : null}
            </li>
          ))}
          {(output.alerts as unknown[]).length === 0 ? (
            <li className="text-muted-foreground">No active alerts for this area.</li>
          ) : null}
        </ul>
      ) : (name === "my_reports" && Array.isArray(output?.reports)) ||
        (name === "match_reports" && Array.isArray(output?.matches)) ? (
        <ul className="space-y-2 text-sm">
          {((output.reports ?? output.matches) as Array<Record<string, unknown>>).map(
            (row, index) => (
              <li
                key={index}
                className="flex items-start justify-between gap-3 rounded-xl border border-border/50 bg-background/30 p-3"
              >
                <span>
                  <span className="block font-medium text-foreground">
                    {String(row.title ?? "Report")}
                  </span>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {String(row.reference ?? "")}
                  </span>
                </span>
                {row.status ? (
                  <span className="shrink-0 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-semibold capitalize text-muted-foreground">
                    {String(row.status)}
                  </span>
                ) : null}
              </li>
            ),
          )}
          {((output.reports ?? output.matches) as unknown[]).length === 0 ? (
            <li className="text-muted-foreground">Nothing found.</li>
          ) : null}
        </ul>
      ) : name === "save_draft" && output?.ok ? (
        <p className="text-sm text-muted-foreground">Saved — you can pick this up any time.</p>
      ) : (
        <p className="text-sm text-muted-foreground">Done.</p>
      )}
    </div>
  );
}

export function AllmaChat({
  threadId,
  initialMessages,
  initialPrompt,
  className,
}: {
  threadId: string | null;
  initialMessages?: UIMessage[];
  initialPrompt?: string;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [pendingAccept, setPendingAccept] = useState<string | undefined>();
  const [pendingCapture, setPendingCapture] = useState<"environment" | undefined>();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: async ({ messages, body }) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers: Record<string, string> = {};
          if (token) headers.Authorization = `Bearer ${token}`;
          return {
            body: { ...body, messages, threadId },
            headers,
          };
        },
      }),
    [threadId],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: threadId ?? "guest",
    messages: initialMessages,
    transport,
    onError: (chatError) => {
      console.error(chatError);
      toast.error("Allma could not respond just now. Please try again.");
    },
  });

  const busy = status === "submitted" || status === "streaming";

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    focusInput();
  }, [focusInput, threadId]);

  useEffect(() => {
    if (status === "ready") focusInput();
  }, [status, focusInput]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if ((!trimmed && attachments.length === 0) || busy) return;

      const parts: UIMessage["parts"] = [];
      if (trimmed) {
        parts.push({ type: "text", text: trimmed });
      }
      for (const attachment of attachments) {
        parts.push({
          type: "file",
          mediaType: attachment.mediaType,
          filename: attachment.name,
          url: attachment.url,
        });
      }

      void sendMessage({ role: "user", parts });
      setAttachments([]);
      focusInput();
    },
    [attachments, busy, sendMessage, focusInput],
  );

  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !initialPrompt || messages.length > 0) return;
    seeded.current = true;
    send(initialPrompt);
  }, [initialPrompt, messages.length, send]);

  const {
    recording,
    transcribing,
    toggle: toggleVoice,
  } = useVoiceInput({
    onTranscript: (text) => {
      const field = textareaRef.current;
      if (!field) return;
      field.value = field.value ? `${field.value} ${text}` : text;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      focusInput();
    },
    onError: (message) => toast.error(message),
  });

  const uploadFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      toast.error("Sign in to attach photos or files to your report.");
      return;
    }

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 20MB.`);
          continue;
        }
        const path = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error: uploadError } = await supabase.storage
          .from("evidence")
          .upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (uploadError) {
          console.error(uploadError);
          toast.error(`Could not upload ${file.name}.`);
          continue;
        }
        const { data: signed, error: signError } = await supabase.storage
          .from("evidence")
          .createSignedUrl(path, 3600);
        if (signError || !signed?.signedUrl) {
          toast.error(`Could not attach ${file.name}.`);
          continue;
        }
        setAttachments((current) => [
          ...current,
          {
            id: path,
            name: file.name,
            mediaType: file.type || "application/octet-stream",
            url: signed.signedUrl,
            preview: URL.createObjectURL(file),
          },
        ]);
      }
    } finally {
      setUploading(false);
    }
  }, []);

  const isEmpty = messages.length === 0;
  const lastMsg = messages[messages.length - 1];

  // Contextual chips come from the model's suggest_replies tool for the last
  // assistant turn. No generic fallback list — suggestions always follow the topic.
  const contextualChips = useMemo(() => {
    if (busy || isEmpty || status !== "ready" || lastMsg?.role !== "assistant") return [];
    const parts = (lastMsg.parts ?? []) as ToolPart[];
    // A live step question owns the chip row — its options are the answers.
    const stepPart = [...parts].reverse().find((p) => p.type === "tool-ask_structured_question") as
      ToolPart | undefined;
    const stepOutput = stepPart?.output as
      { options?: Array<{ label: string; value: string }> } | undefined;
    if (stepPart) {
      if (stepOutput?.options?.length) {
        return stepOutput.options
          .slice(0, 5)
          .map((opt) => ({ label: opt.label, prompt: opt.value }));
      }

      const question = String(
        (stepPart.output as { question?: string } | undefined)?.question ?? "",
      );
      const fallback = STEP_FALLBACK_CHIPS.find(({ matches }) => matches.test(question));
      return (
        fallback?.chips ?? [
          { label: "Yes", prompt: "Yes" },
          { label: "No", prompt: "No" },
          { label: "I'm not sure", prompt: "I'm not sure" },
        ]
      );
    }
    const suggestionPart = [...parts].reverse().find((p) => p.type === "tool-suggest_replies") as
      ToolPart | undefined;
    const output = suggestionPart?.output as
      { suggestions?: Array<{ label: string; prompt: string }> } | undefined;
    const suggestions = ((output?.suggestions ?? []) as Suggestion[]).slice(0, 4);
    return suggestions.length > 0 ? suggestions : IDLE_CHIPS;
  }, [busy, isEmpty, status, lastMsg]);

  const showChips = contextualChips.length > 0;

  const shareLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      toast.error("Location not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        send(
          `My current location is: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
        );
      },
      () => toast.error("Location permission denied."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [send]);

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden", className)}>
      {/* Hidden file input for attachment sheet */}
      <input
        ref={attachInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          void uploadFiles(event.target.files);
          event.target.value = "";
          setAttachSheetOpen(false);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,application/pdf"
        className="hidden"
        onChange={(event) => {
          void uploadFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {isEmpty ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full px-0 pb-6 lg:px-0">
            <AssistantHero onSelect={send} />
          </div>
        </div>
      ) : (
        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="mx-auto w-full max-w-3xl px-4 pb-6 lg:px-8">
            <div className="flex flex-col gap-6 pt-6">
              {messages.map((message, msgIndex) => (
                <Message key={message.id} from={message.role}>
                  <MessageContent
                    className={
                      message.role === "assistant"
                        ? "rounded-none bg-transparent px-0 py-0"
                        : "rounded-[1.4rem] rounded-br-sm"
                    }
                  >
                    {message.parts.map((part, index) => {
                      if (part.type === "text") {
                        return message.role === "assistant" ? (
                          <MessageResponse
                            key={index}
                            className="px-0 py-0 text-[15.5px] leading-[1.75] tracking-[-0.005em] text-foreground/95"
                          >
                            {part.text}
                          </MessageResponse>
                        ) : (
                          <p
                            key={index}
                            className="whitespace-pre-wrap rounded-[1.4rem] rounded-br-md bg-gradient-to-br from-primary to-primary-glow px-4 py-3 text-[15px] leading-relaxed text-primary-foreground shadow-lift"
                          >
                            {part.text}
                          </p>
                        );
                      }

                      if (part.type === "file") {
                        return part.mediaType?.startsWith("image/") ? (
                          <img
                            key={index}
                            src={part.url}
                            alt={part.filename ?? "Attached evidence"}
                            className="max-h-56 w-auto rounded-xl border border-border/60 object-cover"
                          />
                        ) : (
                          <span
                            key={index}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-background/20 px-2 py-1 text-xs"
                          >
                            <Paperclip className="h-3 w-3" /> {part.filename ?? "Attachment"}
                          </span>
                        );
                      }
                      if (part.type.startsWith("tool-")) {
                        return (
                          <ToolCard
                            key={index}
                            part={part as ToolPart}
                            onSend={send}
                            onOpenAttach={() => setAttachSheetOpen(true)}
                            onShareLocation={shareLocation}
                          />
                        );
                      }

                      return null;
                    })}
                  </MessageContent>

                  {/* Contextual suggestion chips — generated by the model for this exact step */}
                  {message.role === "assistant" &&
                    msgIndex === messages.length - 1 &&
                    showChips && (
                      <AnimatePresence>
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15, duration: 0.35 }}
                          className="mt-3 flex flex-wrap gap-2"
                        >
                          {contextualChips.map((chip, chipIndex) => (
                            <motion.button
                              key={`${chip.label}-${chipIndex}`}
                              type="button"
                              initial={{ opacity: 0, y: 8, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              transition={{
                                delay: 0.15 + chipIndex * 0.06,
                                duration: 0.3,
                                ease: [0.16, 1, 0.3, 1],
                              }}
                              whileHover={{ scale: 1.04, y: -1 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => send(chip.prompt)}
                              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-primary/30 bg-card/70 px-3.5 py-2 text-[12.5px] font-medium text-foreground/85 shadow-soft backdrop-blur-md transition-colors hover:border-primary/60 hover:bg-primary/[0.06] hover:text-foreground"
                            >
                              <Sparkles className="h-3.5 w-3.5 text-primary/70" />
                              {chip.label}
                            </motion.button>
                          ))}
                        </motion.div>
                      </AnimatePresence>
                    )}
                </Message>
              ))}
              {status === "submitted" ? (
                <Message from="assistant">
                  <MessageContent>
                    <Shimmer className="text-sm">Allma is thinking…</Shimmer>
                  </MessageContent>
                </Message>
              ) : null}
              {error ? (
                <p className="text-sm text-destructive">
                  Something interrupted the response. Try sending your message again.
                </p>
              ) : null}
            </div>
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      <div className="no-print sticky bottom-0 z-30 glass border-t border-border/60 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-4">
        <div className="mx-auto w-full max-w-3xl">
          <div className="chip-scroll -mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
            {QUICK_ACTIONS.map((action) => {
              const ActionIcon = action.icon;
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => send(action.prompt)}
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent hover:text-foreground"
                >
                  <ActionIcon className="h-3.5 w-3.5 text-primary" />
                  {action.label}
                </button>
              );
            })}
          </div>
          {attachments.length > 0 || uploading ? (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="group relative flex items-center gap-2 rounded-xl border border-border/70 bg-card px-2 py-1.5 text-xs shadow-soft"
                >
                  {attachment.mediaType.startsWith("image/") ? (
                    <img
                      src={attachment.preview}
                      alt=""
                      className="h-8 w-8 rounded-lg object-cover"
                    />
                  ) : (
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="max-w-[9rem] truncate">{attachment.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${attachment.name}`}
                    onClick={() =>
                      setAttachments((current) =>
                        current.filter((item) => item.id !== attachment.id),
                      )
                    }
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {uploading ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
                </span>
              ) : null}
            </div>
          ) : null}

          <div
            className={cn(
              "composer-shell focus-within:composer-shell-focused",
              recording && "composer-shell-recording",
            )}
          >
            <div className="composer-surface">
              <PromptInput
                onSubmit={(message, event) => {
                  event.preventDefault();
                  const text = (message.text ?? "").trim();
                  if (!text) return;
                  send(text);
                  setComposerText("");
                  event.currentTarget.reset();
                }}
                className="rounded-[inherit] border-0 bg-transparent shadow-none ring-0 outline-none has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-transparent"
              >
                <InputGroupAddon align="inline-start" className="pl-2">
                  {/* Attachment menu trigger */}
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setAttachSheetOpen(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-accent hover:text-foreground hover:scale-110"
                    aria-label="Attach files"
                  >
                    <Plus className="h-[17px] w-[17px]" />
                  </motion.button>
                </InputGroupAddon>

                <PromptInputTextarea
                  ref={textareaRef}
                  placeholder="Ask Allma to help, report, or find help…"
                  className="min-h-[2.75rem] bg-transparent py-3 text-[14px] leading-6"
                  onChange={(event) => setComposerText(event.target.value)}
                />

                <InputGroupAddon align="inline-end" className="gap-0.5 pr-2">
                  <button
                    type="button"
                    onClick={toggleVoice}
                    disabled={transcribing}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-accent hover:text-foreground hover:scale-110",
                      recording &&
                        "bg-destructive text-destructive-foreground hover:bg-destructive",
                    )}
                    aria-label={recording ? "Stop recording" : "Voice input"}
                  >
                    {transcribing ? (
                      <Loader2 className="h-[17px] w-[17px] animate-spin" />
                    ) : (
                      <Mic className="h-[17px] w-[17px]" />
                    )}
                  </button>
                  {composerText.trim().length > 0 ? (
                    <PromptInputSubmit status={status} disabled={busy} size="icon-sm" />
                  ) : null}
                </InputGroupAddon>
              </PromptInput>
            </div>
          </div>

          <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">
            Police Integration Ready — not officially connected to police or emergency services
          </p>
        </div>
      </div>

      {/* ── Attachment bottom sheet ── */}
      <Drawer open={attachSheetOpen} onOpenChange={setAttachSheetOpen}>
        <DrawerContent className="mx-auto max-w-lg rounded-t-[1.75rem] border-border/60 bg-card/95 backdrop-blur-xl">
          <DrawerHeader className="pb-2 pt-4">
            <DrawerTitle className="text-base font-semibold">Add to your report</DrawerTitle>
          </DrawerHeader>
          <div className="grid grid-cols-3 gap-3 px-4 pb-6 pt-2">
            {ATTACHMENT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <motion.button
                  key={opt.id}
                  type="button"
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    if (attachInputRef.current) {
                      attachInputRef.current.accept = opt.accept;
                      if (opt.capture) {
                        attachInputRef.current.setAttribute("capture", opt.capture);
                      } else {
                        attachInputRef.current.removeAttribute("capture");
                      }
                      attachInputRef.current.click();
                    }
                  }}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-border/50 bg-card p-4 shadow-soft transition-all hover:border-primary/40 hover:bg-accent"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </span>
                  <span className="text-[11px] font-medium text-muted-foreground">{opt.label}</span>
                </motion.button>
              );
            })}
            {/* Location option */}
            <motion.button
              type="button"
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setAttachSheetOpen(false);
                shareLocation();
              }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border/50 bg-card p-4 shadow-soft transition-all hover:border-primary/40 hover:bg-accent"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Navigation className="h-5 w-5 text-primary" />
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">Location</span>
            </motion.button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
