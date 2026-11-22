import { InChatSos } from "@/components/allma/in-chat-sos";
import { SosFloatingChatHeads } from "@/components/allma/sos-floating-chat-heads";
import {
  SosResponderJoinedToast,
  useResponderJoinedNotifications,
} from "@/components/allma/sos-responder-joined-toast";
import { ComposerRecipientSelector } from "@/components/allma/composer-recipient-selector";
import {
  Conversation,
  ConversationContent,
  ConversationNewMessagesButton,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  normalizeChatRecipient,
  type ChatRecipient,
} from "@/lib/chat-recipient";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Pill,
  HelpCircle,
  Hospital,
  Loader2,
  MapPin,
  Megaphone,
  Mic,
  MicOff,
  AudioLines,
  Folder,
  Image as ImageIcon,
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
  Users,
  Video,
  FileAudio,
  FileIcon,
  Navigation,
  X,
  Check,
  Copy,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
  PhoneOff,
  SendHorizontal,
  ChevronRight,
  Star,
} from "lucide-react";
import { setVoiceMode } from "@/components/allma/voice-mode-toggle";

import { motion, AnimatePresence } from "motion/react";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import robotAvatar from "@/assets/allma-robot.png";
import {
  PromptInput,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { InputGroupAddon } from "@/components/ui/input-group";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { AssistantHero } from "@/components/allma/assistant-hero";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { EMERGENCY_BLOCK_LINES } from "@/lib/emergency-triage";
import type { FirstAid, Incident } from "@/lib/allma-emergency-playbook";
import { facilitiesFromLocationIntel, firstAidFallback, hasNotDoctorLine, incidentForReply, messageHasPlaces, preferredFirstAid, shouldRenderToolCard, shouldShowToolOutput, stripDuplicateFirstAidProse, stripFillerSentences } from "@/lib/chat-emergency-view";
import {
  assistantHasVisibleText,
  chatProgressSteps,
  findFacilitiesProgress,
  isChatProgressStepId,
  progressStepsFromParts,
  type ChatProgressStep,
  type ChatProgressStepId,
} from "@/lib/chat-progress";
import { KIND_LABEL } from "@/lib/facility-results";
import { facilityKind } from "@/lib/facility-kind";
import { dedupeRepeatedParts, parseAllmaMarkers, type MarkerMedia } from "@/lib/allma-markers";
import { useAuth } from "@/hooks/useAuth";
import { Avatar } from "@/components/allma/safety-network/add-safety-contact";
import {
  chatThreadContextQueryOptions,
  getSosRoomVoiceNoteUrl,
  listConversationMessages,
  persistConversationMessages,
  sendSosRoomVoiceNote,
  sosRoomMessagesQueryOptions,
  sosRoomQueryOptions,
  subscribeConversationMessages,
  subscribeSosRoomMessages,
  subscribeSosRoomParticipants,
  type ChatThreadContext,
  type SharedChatMessageRow,
  type SosRoomMessage,
} from "@/lib/sos-rooms";
import { buildSosParticipantStrip } from "@/lib/sos-participants";
import { runSosInlineCallAction, useSosInlineCall } from "@/lib/sos-inline-call";
import { peekActiveChatThread, rememberActiveChatThread } from "@/lib/active-chat-thread";
import {
  stashPendingChatMessages,
  takePendingChatMessages,
} from "@/lib/pending-chat-messages";
import { createThread } from "@/lib/threads";


type ToolPart = {
  type: string;
  state?: string;
  output?: unknown;
};

type Suggestion = { label: string; prompt: string };
type TimelineItem =
  | { kind: "chat"; message: UIMessage; msgIndex: number; timestamp: number }
  | { kind: "sos"; message: SosRoomMessage; timestamp: number };

function toSharedUiMessage(row: SharedChatMessageRow): UIMessage {
  return {
    id: row.sdk_message_id || row.id,
    role: row.role as UIMessage["role"],
    parts: (Array.isArray(row.parts) ? row.parts : []) as UIMessage["parts"],
    authorId: row.user_id,
    createdAt: row.created_at,
    recipient: row.recipient === "responders" ? "responders" : "allma",
  } as UIMessage;
}

function mergeSharedMessages(
  current: UIMessage[],
  incoming: SharedChatMessageRow[],
): UIMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const row of incoming) {
    const message = toSharedUiMessage(row);
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((left, right) => {
    const leftDate = (left as UIMessage & { createdAt?: string | Date }).createdAt;
    const rightDate = (right as UIMessage & { createdAt?: string | Date }).createdAt;
    const leftTime = leftDate ? new Date(leftDate).getTime() : Number.MAX_SAFE_INTEGER;
    const rightTime = rightDate ? new Date(rightDate).getTime() : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime;
  });
}

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

// Sentinel prompt: this chip opens the attachment picker instead of sending text.
/** Grow the composer textarea with its content, capped at ~5 lines (then it scrolls). */
const COMPOSER_MAX_HEIGHT_PX = 6 * 24 - 4; // 5 lines of 24px + vertical padding
function autoGrowTextarea(field: HTMLTextAreaElement | null) {
  if (!field) return;
  field.style.height = "auto";
  field.style.height = `${Math.min(field.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  field.style.overflowY = field.scrollHeight > COMPOSER_MAX_HEIGHT_PX ? "auto" : "hidden";
}

const ATTACH_CHIP = "__attach__";
const LOCATION_CHIP = "__share_location__";
/** Assistant prose that is asking where the user is. */
const LOCATION_ASK = /\b(where are you|your area|area, |neighbourhood|neighborhood|landmark|nearest landmark|share your (?:current )?location|which (?:area|district)|what area)\b/i;



const IDLE_CHIPS: Suggestion[] = [
  { label: "Report a crime", prompt: "I want to report a crime" },
  { label: "Find help nearby", prompt: "Find help near me" },
  { label: "Emergency numbers", prompt: "Show me the emergency numbers" },
];

// Topic-derived answers, used whenever the assistant asks something without
// supplying options. Ordered most-specific first; the first match wins.
const STEP_FALLBACK_CHIPS: Array<{ matches: RegExp; chips: Suggestion[] }> = [
  {
    matches: /\b(lose|lost)\b.*\b(or|vs)\b.*\bfound\b|did you lose|lost or found|lose an item|find someone else/i,
    chips: [
      { label: "I lost something", prompt: "__lost_found_lost__" },
      { label: "I found something", prompt: "__lost_found_found__" },
    ],
  },
  {
    matches: /safe|danger|immediate|threat|hurt|injur/i,
    chips: [
      { label: "Yes, I'm safe", prompt: "Yes, I'm safe" },
      { label: "No, I'm in danger", prompt: "No, I'm in danger" },
      { label: "I'm not sure", prompt: "I'm not sure if I'm safe" },
    ],
  },
  {
    matches: /photo|picture|image|video|evidence|attach|upload/i,
    chips: [
      { label: "Attach a photo", prompt: ATTACH_CHIP },
      { label: "Skip for now", prompt: "Skip for now" },
    ],
  },
  {
    matches: /adult or child|how old|\bage\b|child|minor/i,
    chips: [
      { label: "An adult", prompt: "The person is an adult" },
      { label: "A child", prompt: "The person is a child" },
      { label: "I'll type the age", prompt: "I'll type the age" },
    ],
  },
  {
    matches: /police|hospital|clinic|fire brigade|ambulance|which service|kind of help/i,
    chips: [
      { label: "Police station", prompt: "I need the nearest police station" },
      { label: "Hospital", prompt: "I need the nearest hospital" },
      { label: "Fire station", prompt: "I need the nearest fire station" },
    ],
  },
  {
    matches: /what (kind|type) of (crime|incident)|theft|robbery|assault|burglar|fraud|what happened/i,
    chips: [
      { label: "Theft", prompt: "It was a theft" },
      { label: "Robbery", prompt: "It was a robbery" },
      { label: "Assault", prompt: "It was an assault" },
      { label: "Something else", prompt: "It was something else, I'll describe it" },
    ],
  },
  {
    matches: /\bwhat (item|was lost|did you)\b|describe the item|kind of item|phone|wallet|bag|document/i,
    chips: [
      { label: "Phone", prompt: "It is a phone" },
      { label: "Wallet or purse", prompt: "It is a wallet or purse" },
      { label: "Documents", prompt: "They are documents" },
      { label: "I'll describe it", prompt: "I'll describe the item myself" },
    ],
  },
  {
    matches: /where|location|place|area|landmark|district/i,
    chips: [
      { label: "Share my location", prompt: LOCATION_CHIP },
      { label: "Type the location", prompt: "I'll type the location" },
      { label: "I'm not sure", prompt: "I'm not sure of the exact location" },
    ],
  },
  {
    matches: /when|time|date|last seen|how long/i,
    chips: [
      { label: "Today", prompt: "It happened today" },
      { label: "Yesterday", prompt: "It happened yesterday" },
      { label: "I'm not sure", prompt: "I'm not sure when it happened" },
    ],
  },
  {
    matches: /file (this|the) report|submit|shall I|should I file|confirm|is that right|correct\?/i,
    chips: [
      { label: "Yes, file it", prompt: "Yes, please file the report" },
      { label: "Let me correct something", prompt: "I need to correct something first" },
      { label: "Not yet", prompt: "Not yet" },
    ],
  },
  {
    matches: /contact|phone number|name|reach you/i,
    chips: [
      { label: "Use my profile details", prompt: "Use the contact details on my profile" },
      { label: "I'll type them", prompt: "I'll type my contact details" },
      { label: "Keep me anonymous", prompt: "Please keep me anonymous" },
    ],
  },
];

// Sentences the model sometimes leads with even when the user opened with a
// concrete request. Presentation-only: the stored message keeps its text.
const GREETING_LEAD =
  /^\s*(?:👋|🙏|hi|hello|hey)?[^.!?\n]*\b(?:i(?:'|’)?m|i am)\s+allma[^.!?\n]*[.!?]\s*/i;
const INTENT_OPENER =
  /\b(report|lost|found|missing|stolen|theft|robbery|assault|crime|sos|emergency|ambulance|police|hospital|fire|help near|nearest)\b/i;


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
      className="relative overflow-hidden rounded-2xl border border-border bg-card/60 px-3.5 py-3"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <FlowIcon className="h-4 w-4 text-primary" />
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

function MediaRequestCard({
  media,
  onSend,
  onOpenAttach,
  onShareLocation,
}: {
  media: MarkerMedia;
  onSend: (text: string) => void;
  onOpenAttach?: (mediaType?: string) => void;
  onShareLocation?: () => void;
}) {
  const mediaType = media.mediaType || "photo";
  const prompt = media.prompt || "Please upload a photo or file.";
  const tips = media.tips ?? DEFAULT_MEDIA_TIPS[mediaType] ?? null;
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
        onClick={() => (isLocation ? onShareLocation?.() : onOpenAttach?.(mediaType))}
        className="flex w-full items-center gap-3 rounded-[1.25rem] border border-gold/35 bg-gold/[0.08] px-4 py-3.5 text-left transition-colors hover:border-gold/60 hover:bg-gold/[0.14]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold to-primary shadow-soft">
          <MediaIcon className="h-5 w-5 text-primary-foreground" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">{prompt}</span>
          {tips ? <span className="block truncate text-xs text-muted-foreground">{tips}</span> : null}
        </span>
      </motion.button>
      {media.optional ? (
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

const ATTACHMENT_OPTIONS = [
  {
    id: "photo_video",
    icon: ImageIcon,
    label: "Photo or Video",
    accept: "image/*,video/*",
    capture: undefined as undefined,
  },
  {
    id: "camera",
    icon: Camera,
    label: "Take Photo",
    accept: "image/*",
    capture: "environment" as const,
  },
  {
    id: "scan",
    icon: FileText,
    label: "Scan Document",
    accept: "image/*,application/pdf",
    capture: undefined as undefined,
  },
  {
    id: "file",
    icon: Folder,
    label: "Choose File",
    accept: "image/*,video/*,audio/*,application/pdf,.doc,.docx",
    capture: undefined as undefined,
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

const FACILITY_LABEL: Record<string, string> = {
  hospital: "Hospital", medical_clinic: "Clinic", doctor: "Clinic / Health centre", pharmacy: "Pharmacy",
  police: "Police", fire_station: "Fire & Rescue", fire: "Fire & Rescue", ambulance: "Ambulance",
};

function PlaceThumb({ photo, type }: { photo: string | null; type: string }) {
  const [failed, setFailed] = useState(false);
  if (photo && !failed) {
    return <img src={photo} alt="" loading="lazy" onError={() => setFailed(true)} className="h-12 w-12 shrink-0 rounded-xl bg-muted object-cover" />;
  }
  const Icon = /police/.test(type) ? Shield : /fire/.test(type) ? Flame : /pharmacy/.test(type) ? Pill : /ambulance/.test(type) ? Ambulance : Hospital;
  const tone = /police/.test(type) ? "bg-primary/10 text-primary" : /fire/.test(type) ? "bg-destructive/10 text-destructive" : "bg-chat-user text-chat-accent";
  return (
    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${tone}`} aria-hidden>
      <Icon className="h-5 w-5" />
    </span>
  );
}

/** True when this message already shows the ::emergency action block at the top. */
const EmergencyShownContext = createContext(false);
/** The emergency the user described for this reply (null for plain searches like "nearest hospital"). */
const IncidentContext = createContext<Incident | null>(null);
/** True when this message's find_facilities results already listed places. */
const HasPlacesContext = createContext(false);
const SosActivityContext = createContext<{
  threadId: string | null;
  activityId: string | null;
  active: boolean;
  canManage: boolean;
  sharedLocation: { latitude: number; longitude: number; accuracy_m: number | null } | null;
  /** Name of the person who needs help (the SOS owner), for responder views. */
  ownerName: string | null;
  onActivityStarted?: (activityId: string, card: HTMLDivElement | null) => void;
  onActivityEnded?: (activityId: string) => void;
  onEnsureThread?: () => Promise<string>;
}>({
  threadId: null,
  activityId: null,
  active: false,
  canManage: false,
  sharedLocation: null,
  ownerName: null,
});

/** Numbered first-aid steps + red flags, shown when the reply itself skipped them. */
function FirstAidCard({ aid, followUp }: { aid: FirstAid; followUp: string | null }) {
  return (
    <div className="w-full rounded-2xl border border-border/50 bg-card/70 p-4 text-base leading-[1.6] text-foreground">
      <p className="mb-2 font-semibold">Do this now:</p>
      <ol className="list-decimal space-y-1.5 pl-5">
        {aid.steps.map((step, i) => <li key={i}>{step}</li>)}
      </ol>
      {aid.redFlags.length ? (
        <>
          <p className="mb-1.5 mt-3 font-semibold">Get help now if:</p>
          <ul className="list-disc space-y-1 pl-5">
            {aid.redFlags.map((flag, i) => <li key={i}>{flag}</li>)}
          </ul>
        </>
      ) : null}
      {aid.notDoctor ? <p className="mt-3 text-[13px] text-muted-foreground">{aid.notDoctor}</p> : null}
      {followUp ? <p className="mt-3 font-semibold">{followUp}</p> : null}
    </div>
  );
}

/** Activate SOS (user taps — never automatic) + one call button per number. */
function EmergencyActions({
  type,
  offerMode = false,
  includeCallLinks = true,
}: {
  type: "medical" | "crime" | "fire";
  offerMode?: boolean;
  includeCallLinks?: boolean;
}) {
  const sosActivity = useContext(SosActivityContext);
  return (
    <InChatSos
      type={type}
      lines={includeCallLinks ? EMERGENCY_BLOCK_LINES[type] : []}
      threadId={sosActivity.threadId}
      existingActivityId={sosActivity.activityId}
      existingActive={sosActivity.active}
      sharedLocation={sosActivity.sharedLocation}
      canManage={sosActivity.canManage}
      ownerName={sosActivity.ownerName}
      offerMode={offerMode}
      onActivityStarted={sosActivity.onActivityStarted}
      onActivityEnded={sosActivity.onActivityEnded}
      onEnsureThread={sosActivity.onEnsureThread}
    />
  );
}

function roleLabel(role?: string) {
  if (role === "owner") return "SOS caller";
  if (role === "responder") return "Responder";
  return "Safety contact";
}

const SYSTEM_NOTICE_RE =
  /^(?:.+ joined the shared conversation\.|.+ left the shared conversation\.|Emergency SOS (?:activated|ended)\b[\s\S]*|SOS ended\b[\s\S]*)$/;

/**
 * Full text of an assistant message that is really a group system notice
 * (a responder joined, the SOS ended). In the shared conversation these
 * render as a centred pill, WhatsApp-group style — not as an Allma AI
 * bubble. Returns null for ordinary replies and anything with tool parts.
 */
function systemNoticeText(message: UIMessage): string | null {
  if (message.role !== "assistant") return null;
  if (message.parts.some((p) => p.type !== "text")) return null;
  const text = message.parts
    .map((p) => (p.type === "text" ? parseAllmaMarkers(p.text).text : ""))
    .join("\n")
    .trim();
  return SYSTEM_NOTICE_RE.test(text) ? text : null;
}

/** WhatsApp assigns each group member a stable name colour — do the same. */
const SOS_NAME_COLORS = [
  "text-sky-600 dark:text-sky-400",
  "text-rose-600 dark:text-rose-400",
  "text-emerald-600 dark:text-emerald-400",
  "text-amber-600 dark:text-amber-400",
  "text-violet-600 dark:text-violet-400",
  "text-orange-600 dark:text-orange-400",
  "text-teal-600 dark:text-teal-400",
  "text-fuchsia-600 dark:text-fuchsia-400",
] as const;

function sosNameColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return SOS_NAME_COLORS[hash % SOS_NAME_COLORS.length];
}

function SosTimelineEvent({
  message,
  person,
  mine,
  voiceUrl,
  voiceUrlError,
}: {
  message: SosRoomMessage;
  person?: { name: string; avatar: string | null; role: string };
  mine: boolean;
  voiceUrl?: string;
  voiceUrlError: boolean;
}) {
  if (message.event_type !== "user_message" && message.event_type !== "voice_note") {
    const joined = message.event_type === "participant_joined";
    return (
      <motion.div
        key={message.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto flex max-w-[92%] items-center justify-center gap-2 py-0.5 pl-1 pr-[4.75rem] sm:pr-[5.5rem]"
      >
        <span
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-center text-[11px] font-medium",
            joined
              ? "border-success/30 bg-success/10 text-success"
              : "border-border/50 bg-muted/55 text-muted-foreground",
          )}
        >
          {joined ? <Users className="h-3 w-3 shrink-0" /> : <ShieldAlert className="h-3 w-3 shrink-0" />}
          <span className="min-w-0">{message.body}</span>
        </span>
      </motion.div>
    );
  }

  const timestamp = new Date(message.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const duration = message.duration_seconds
    ? `${String(Math.floor(message.duration_seconds / 60)).padStart(2, "0")}:${String(message.duration_seconds % 60).padStart(2, "0")}`
    : null;

  return (
    <motion.div
      key={message.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex items-end gap-1.5", mine && "justify-end")}
    >
      {!mine ? (
        <span className="shrink-0">
          <Avatar name={person?.name ?? "Allma member"} url={person?.avatar ?? null} size={40} />
        </span>
      ) : null}
      <div className="min-w-0 max-w-[84%]">
        <div
          className={cn(
            "relative px-3.5 py-2.5 text-left text-[14px] leading-relaxed shadow-sm",
            mine
              ? "rounded-[1.25rem] rounded-br-md bg-[#d9fdd3] text-foreground ring-1 ring-black/5 dark:bg-[#005c4b] dark:text-[#e9edef] dark:ring-white/10"
              : "rounded-[1.25rem] rounded-bl-md bg-card text-foreground ring-1 ring-border/60",
          )}
        >
          {!mine ? (
            <span className={cn("mb-0.5 block text-[13px] font-bold", sosNameColor(person?.name ?? "Allma member"))}>
              {person?.name ?? "Allma member"}
            </span>
          ) : null}
          {message.event_type === "voice_note" ? (
            <div className="flex min-w-[180px] items-center gap-2">
              <span className={cn("grid h-8 w-8 place-items-center rounded-full", mine ? "bg-black/10 dark:bg-white/15" : "bg-muted")}>
                <Mic className="h-4 w-4 shrink-0" />
              </span>
              {voiceUrl ? (
                <audio
                  controls
                  preload="none"
                  src={voiceUrl}
                  aria-label={`Voice note from ${person?.name ?? "Allma member"}`}
                  className="h-9 min-w-0 max-w-[260px]"
                />
              ) : (
                <span className="text-xs">
                  {voiceUrlError ? "Voice note unavailable" : "Preparing voice note…"}
                </span>
              )}
              {duration ? <span className="shrink-0 text-[10px] tabular-nums opacity-80">{duration}</span> : null}
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          )}
          <span className="mt-1 block text-right text-[10px] leading-none text-muted-foreground">
            <time dateTime={message.created_at}>{timestamp}</time>
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function FacilityResults({ output }: { output: Record<string, unknown> }) {
  const navigate = useNavigate();
  const facilities = output.facilities as Array<Record<string, unknown>>;
  const t = String(output.emergency_type ?? facilities[0]?.facility_type ?? "");
  const [filter, setFilter] = useState<string>("All");
  const labelOf = (f: Record<string, unknown>) =>
    (typeof f.type_label === "string" && f.type_label) ||
    FACILITY_LABEL[String(f.facility_type ?? "")] ||
    KIND_LABEL[facilityKind(String(f.facility_type ?? t), String(f.name ?? ""))] ||
    "Other";
  const types = Array.from(new Set(facilities.map(labelOf)));
  const shown = filter === "All" ? facilities : facilities.filter((f) => labelOf(f) === filter);
  // SOS lives once at the top of the assistant message — never inside place cards.
  return (
    <div className="w-full space-y-2.5">
      {facilities.length === 0 ? (
        <p className="rounded-2xl border border-border/60 bg-card p-3.5 text-[14px] leading-relaxed text-foreground">{output.location_unconfirmed ? "I couldn't confirm where you are, so I won't show places that may be far away. Tap Share my location or type your town or area." : "No places found nearby. Share your location or type your town or area."}</p>
      ) : (
        <>
          {output.resolved_area ? (
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground"><MapPin className="h-3.5 w-3.5 text-chat-accent" />Nearest to {String(output.resolved_area)}</p>
          ) : null}
          {types.length > 1 ? (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
              {["All", ...types].map((ty) => (
                <button key={ty} type="button" onClick={() => setFilter(ty)} className={cn("shrink-0 rounded-full border px-3 py-1 text-[12.5px] font-semibold", filter === ty ? "border-chat-accent bg-chat-accent text-chat-accent-foreground" : "border-border bg-background text-foreground")}>
                  {ty}{ty !== "All" ? ` (${facilities.filter((f) => labelOf(f) === ty).length})` : ""}
                </button>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {shown.map((facility, index) => {
              const lat = Number(facility.lat ?? facility.latitude);
              const lng = Number(facility.lng ?? facility.longitude);
              const dest = Number.isFinite(lat) && Number.isFinite(lng) && facility.latitude != null ? `${lat},${lng}` : encodeURIComponent(String(facility.name) + " " + String(facility.district ?? ""));
              const km = facility.distance_km != null && Number.isFinite(Number(facility.distance_km)) ? Number(facility.distance_km) : null;
              const label =
                (typeof facility.type_label === "string" && facility.type_label) ||
                FACILITY_LABEL[String(facility.facility_type ?? "")] ||
                KIND_LABEL[facilityKind(String(facility.facility_type ?? t), String(facility.name ?? ""))] ||
                null;
              const phone = typeof facility.phone === "string" && facility.phone ? facility.phone : null;
              const photo = typeof facility.photo_url === "string" && facility.photo_url ? facility.photo_url : null;
              const address = typeof facility.address === "string" && facility.address ? facility.address : null;
              const meta = [
                km != null ? `${km} km` : null,
                index === 0 && filter === "All" ? "Nearest" : null,
                facility.open_now === true ? "Open now" : null,
                address,
              ].filter(Boolean).join(" · ");
              return (
                <div key={index} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-3">
                  <PlaceThumb photo={photo} type={String(facility.facility_type ?? t)} />
                  <div className="min-w-0 flex-1">
                    {label ? <span className="mb-1 inline-block rounded-full bg-chat-user px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-chat-accent">{label}</span> : null}
                    <p className="truncate text-[15px] font-semibold leading-snug text-foreground">{String(facility.name)}</p>
                    {meta ? <p className="mt-0.5 truncate text-[12.5px] leading-5 text-muted-foreground">{meta}</p> : null}
                    <div className="mt-2.5 flex gap-2">
                      {phone ? (
                        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background px-3 text-[13px] font-semibold text-foreground">
                          <Phone className="h-3.5 w-3.5 shrink-0" /> Call
                        </a>
                      ) : null}
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${dest}`} target="_blank" rel="noreferrer" className="inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-chat-accent px-3 text-[13px] font-semibold text-chat-accent-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" /> Directions
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ChatProgressChecklist({ steps }: { steps: ChatProgressStep[] }) {
  const completed = steps.filter((step) => step.state === "done");
  const active = steps.find((step) => step.state === "active") ?? (completed.length === steps.length ? null : steps.find((step) => step.state === "pending") ?? null);
  const latestDone = completed.length ? completed[completed.length - 1] : null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Allma is preparing a reply"
      className="chat-progress m-0 min-h-7 p-0"
    >
      {latestDone ? (
        <p className="flex items-center gap-2 text-[12.5px] leading-5 text-muted-foreground">
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <span className="truncate">{latestDone.label}</span>
        </p>
      ) : null}
      {active ? (
        <p
          aria-current="step"
          className="flex items-center gap-2 text-[13.5px] font-medium leading-6 text-foreground"
        >
          <span className="chat-progress-dot" aria-hidden />
          <span className="truncate">{active.label}</span>
        </p>
      ) : null}
    </div>
  );
}

function ToolCard({
  part,
  onSend,
  onOpenAttach,
  onShareLocation,
}: {
  part: ToolPart;
  onSend: (text: string) => void;
  onOpenAttach?: (mediaType?: string) => void;
  onShareLocation?: () => void;
}) {
  const name = part.type.replace(/^tool-/, "");
  const hasPlaces = useContext(HasPlacesContext);
  const running = part.state !== "output-available" && part.state !== "output-error";
  const output = part.output as Record<string, unknown> | undefined;

  // Internal provider/model tool calls have no user-facing card. The matching
  // first-aid playbook is rendered separately as actionable guidance.
  if (!shouldRenderToolCard(name)) return null;

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
      label: "Nearby help",
      busy: "Searching the directory…",
    },
    case_timeline: { icon: Clock, label: "Case timeline", busy: "Building timeline…" },
  };
  const entry = meta[name] ?? { icon: FileText, label: name, busy: "Working…" };
  const Icon = entry.icon;

  if (!running && (name === "remember" || name === "recall_history" || name === "get_draft")) {
    return null;
  }

  if (running) {
    // The live checklist already covers find_facilities; skip noisy busy stubs.
    if (
      name === "find_facilities" ||
      name === "list_alerts" ||
      name === "report_summary" ||
      name === "create_report"
    ) {
      return null;
    }
    return (
      <div className="chat-card p-3">
        <Shimmer className="text-sm">{entry.busy}</Shimmer>
      </div>
    );
  }

  // Empty / rejected report cards must never show as "REPORT SUMMARY · Done."
  if (!shouldShowToolOutput(name, output)) return null;

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
    return (
      <MediaRequestCard
        media={{
          mediaType: String(output.media_type ?? "photo"),
          prompt: String(output.prompt ?? ""),
          tips: output.tips ? String(output.tips) : null,
          optional: Boolean(output.optional),
        }}
        onSend={onSend}
        onOpenAttach={onOpenAttach}
        onShareLocation={onShareLocation}
      />
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

  // Retired Location Intelligence card: never render that UI. If a past
  // reply still has the tool result and no find_facilities cards, show the
  // same stations as normal FacilityResults so the responsible station is not lost.
  if (name === "location_intelligence") {
    if (hasPlaces) return null;
    const facilities = facilitiesFromLocationIntel(output);
    if (!facilities.length) return null;
    const area = output?.area ? String(output.area) : "";
    return (
      <FacilityResults
        output={{
          facilities,
          resolved_area: area && !/^your shared/i.test(area) ? area : undefined,
          emergency_type: facilities[0]?.facility_type,
        }}
      />
    );
  }

  // ── case_timeline card ───────────────────────────────────────
  if (name === "case_timeline" && output?.ok) {
    const events = Array.isArray(output.events)
      ? (output.events as Array<{ label?: string }>).filter(
          (event) => typeof event?.label === "string" && event.label.trim().length > 0,
        )
      : [];
    if (events.length === 0) return null;
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

  if (name === "find_facilities") {
    const facilities = Array.isArray(output?.facilities) ? output.facilities : [];
    if (facilities.length) {
      return <FacilityResults output={output as Record<string, unknown>} />;
    }
    return (
      <div className="chat-card w-full space-y-3 p-4">
        <div>
          <p className="font-semibold text-foreground">Nearby help</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Nearby places could not be loaded. Share your location or type a town in the chat to search again.
          </p>
        </div>
        {onShareLocation ? (
          <button
            type="button"
            onClick={onShareLocation}
            className="w-full rounded-full border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-accent"
          >
            Share my location
          </button>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <a
            href="tel:999"
            aria-label="Call Police 999"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-3 text-center text-sm font-semibold text-foreground"
          >
            <Phone className="h-4 w-4 shrink-0" /> Call Police 999
          </a>
          <a
            href="tel:112"
            aria-label="Call Toll-Free 112"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-chat-accent px-3 text-center text-sm font-semibold text-chat-accent-foreground"
          >
            <Phone className="h-4 w-4 shrink-0" /> Call Toll-Free 112
          </a>
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
            Saved to your reports. Keep your reference number safe — Allma does not contact police
            or emergency services for you.
          </div>
        </div>
      ) : name === "find_facilities" && Array.isArray(output?.facilities) ? (
        <FacilityResults output={output as Record<string, unknown>} />
      ) : name === "list_alerts" && Array.isArray(output?.alerts) && output.alerts.length > 0 ? (
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
      ) : name === "find_facilities" ? (
        <p className="text-sm text-muted-foreground">
          I couldn't load places right now. Tap Share my location or type your town. In danger, call 999 or 112.
        </p>
      ) : (
        // Never show a useless "Done." stub for unknown/empty tool results.
        null
      )}
    </div>
  );
}

/**
 * Signed storage links expire, so history keeps only the object path and mints a
 * fresh link when the attachment is actually opened.
 */
function FileAttachmentChip({ url, filename }: { url: string; filename: string }) {
  const [opening, setOpening] = useState(false);

  const open = async () => {
    const match = /\/object\/(?:sign|public)\/evidence\/([^?]+)/.exec(url);
    if (!match) {
      toast.error("This attachment link is no longer available.");
      return;
    }
    setOpening(true);
    try {
      const { data, error } = await supabase.storage
        .from("evidence")
        .createSignedUrl(decodeURIComponent(match[1]), 300);
      if (error || !data?.signedUrl) throw error ?? new Error("No link");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not open this attachment.");
    } finally {
      setOpening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={open}
      disabled={opening}
      className="inline-flex items-center gap-1.5 rounded-lg bg-background/20 px-2 py-1 text-xs underline-offset-2 hover:underline disabled:opacity-60"
    >
      <Paperclip className="h-3 w-3" /> {filename}
    </button>
  );
}

export function AllmaChat({
  threadId,
  initialMessages,
  initialPrompt,
  fixedComposer = false,
  className,
}: {
  threadId: string | null;
  initialMessages?: UIMessage[];
  initialPrompt?: string;
  fixedComposer?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [composerRecipient, setComposerRecipient] = useState<ChatRecipient>("allma");
  const [activeSosActivity, setActiveSosActivity] = useState<{ id: string; active: boolean } | null>(null);
  const [voiceNoteUrls, setVoiceNoteUrls] = useState<Record<string, string>>({});
  const [voiceNoteUrlErrors, setVoiceNoteUrlErrors] = useState<Set<string>>(() => new Set());
  const [sosVoiceNoteRecording, setSosVoiceNoteRecording] = useState(false);
  const [sosVoiceNoteUploading, setSosVoiceNoteUploading] = useState(false);
  const [sosVoiceNoteSeconds, setSosVoiceNoteSeconds] = useState(0);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const inlineCall = useSosInlineCall();
  const voiceNoteRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceNoteStreamRef = useRef<MediaStream | null>(null);
  const voiceNoteChunksRef = useRef<Blob[]>([]);
  const voiceNoteTimerRef = useRef<number | null>(null);
  const voiceNoteActivityIdRef = useRef<string | null>(null);
  const voiceNoteStartedAtRef = useRef<number | null>(null);
  const voiceNoteCancelledRef = useRef(false);
  const voiceNoteUrlRequestsRef = useRef(new Set<string>());
  const [pendingAccept, setPendingAccept] = useState<string | undefined>();
  const [pendingCapture, setPendingCapture] = useState<"environment" | undefined>();
  // Storage paths of everything uploaded in this conversation, so a report filed
  // later in the same conversation can be linked to the real evidence objects.
  const evidencePathsRef = useRef<Array<{ path: string; mediaType: string }>>([]);

  // Latest device GPS, only when the user already granted location permission.
  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    let watchId: number | null = null;
    const start = () => {
      watchId = navigator.geolocation.watchPosition(
        (pos) => { coordsRef.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }; },
        () => {},
        { enableHighAccuracy: true, maximumAge: 60000, timeout: 20000 },
      );
    };
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (perms?.query) {
      perms.query({ name: "geolocation" as PermissionName }).then((r) => { if (r.state !== "denied") start(); }).catch(start);
    } else {
      start();
    }
    return () => { if (watchId != null) navigator.geolocation.clearWatch(watchId); };
  }, []);

  const composerRecipientRef = useRef<ChatRecipient>(composerRecipient);
  composerRecipientRef.current = composerRecipient;

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
            body: {
              ...body,
              messages,
              threadId,
              evidence: evidencePathsRef.current,
              coords: coordsRef.current,
              recipient: composerRecipientRef.current,
            },
            headers,
          };
        },
      }),
    [threadId],
  );


  const [serverProgress, setServerProgress] = useState<ChatProgressStepId[]>([]);

  const { messages, setMessages, sendMessage, status, error, stop, regenerate } = useChat({
    id: threadId ?? "guest",
    messages: initialMessages,
    transport,
    onData: (part) => {
      const step =
        part.type === "data-chat-progress" && part.data && typeof part.data === "object"
          ? (part.data as { step?: unknown }).step
          : undefined;
      if (!isChatProgressStepId(step)) return;
      setServerProgress((current) => (current.includes(step) ? current : [...current, step]));
    },
    onError: (chatError) => {
      console.error(chatError);
      // The server sends a plain-language reason (busy, credits, blocked); show it.
      const detail = chatError instanceof Error ? chatError.message.trim() : "";
      const human = detail && /\s/.test(detail) && detail.length < 220 && !/^\{|^[A-Za-z]+Error/.test(detail);
      toast.error(human ? detail : "Allma could not respond just now. Please try again.");
    },
  });

  const busy = status === "submitted" || status === "streaming";
  useEffect(() => {
    rememberActiveChatThread(threadId);
    return () => {
      // Keep the last chat thread available for standalone SOS while the user
      // briefly leaves the chat screen; clear only when unmounting without a thread.
      if (!threadId) rememberActiveChatThread(null);
    };
  }, [threadId]);
  const threadContextQuery = useQuery(chatThreadContextQueryOptions(threadId));
  const threadContext = threadContextQuery.data ?? null;
  const sosActivityId =
    inlineCall?.activityId ?? activeSosActivity?.id ?? threadContext?.sos_activity_id ?? null;
  const activeInlineCall =
    inlineCall && inlineCall.activityId === sosActivityId ? inlineCall : null;
  const sosIsActive =
    activeSosActivity?.id === sosActivityId
      ? activeSosActivity.active
      : inlineCall?.activityId === sosActivityId
        ? true
        : Boolean(threadContext?.sos_activity_id === sosActivityId && threadContext.sos_active);
  const canManageSos = threadId ? threadContext?.is_owner === true : Boolean(user?.id);
  const sosRoomQuery = useQuery(sosRoomQueryOptions(sosActivityId));
  const sosRoom = sosRoomQuery.data ?? null;
  const sosMessagesQuery = useQuery(sosRoomMessagesQueryOptions(sosActivityId));
  const sosMessages = useMemo(() => sosMessagesQuery.data ?? [], [sosMessagesQuery.data]);

  useEffect(() => {
    if (!sosActivityId) return;
    return subscribeSosRoomMessages(sosActivityId, (incoming) => {
      queryClient.setQueryData<SosRoomMessage[]>(
        ["sos-room-messages", sosActivityId],
        (current) => {
          const rows = current ?? [];
          if (rows.some((row) => row.id === incoming.id)) return rows;
          return [...rows, incoming].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          );
        },
      );
      void queryClient.invalidateQueries({ queryKey: ["sos-room", sosActivityId] });
    }, () => {
      void queryClient.invalidateQueries({ queryKey: ["sos-room-messages", sosActivityId] });
      void queryClient.invalidateQueries({ queryKey: ["sos-room", sosActivityId] });
    });
  }, [queryClient, sosActivityId]);

  useEffect(() => {
    if (!sosActivityId) return;
    const refreshParticipants = () => {
      void queryClient.invalidateQueries({ queryKey: ["sos-room", sosActivityId] });
    };
    return subscribeSosRoomParticipants(sosActivityId, refreshParticipants);
  }, [queryClient, sosActivityId]);

  useEffect(() => {
    if (!threadId) return;
    const backfillMessages = () => {
      void listConversationMessages(threadId)
        .then((rows) => setMessages((current) => mergeSharedMessages(current, rows)))
        .catch((syncError) => {
          console.warn("Could not refresh shared conversation messages", syncError);
        });
    };
    backfillMessages();
    const poll = window.setInterval(backfillMessages, sosIsActive ? 4_000 : 15_000);
    const unsubscribe = subscribeConversationMessages(
      threadId,
      (incoming: SharedChatMessageRow) => {
        setMessages((current) => mergeSharedMessages(current, [incoming]));
      },
      backfillMessages,
    );
    return () => {
      window.clearInterval(poll);
      unsubscribe();
    };
  }, [setMessages, sosIsActive, threadId]);

  useEffect(() => {
    setVoiceNoteUrls({});
    setVoiceNoteUrlErrors(new Set());
    voiceNoteUrlRequestsRef.current.clear();
  }, [sosActivityId]);

  useEffect(() => {
    if (!sosActivityId) return;
    let cancelled = false;
    const pending = sosMessages.filter(
      (message) =>
        message.event_type === "voice_note" &&
        message.body &&
        !voiceNoteUrlRequestsRef.current.has(message.id),
    );
    for (const message of pending) {
      voiceNoteUrlRequestsRef.current.add(message.id);
      void getSosRoomVoiceNoteUrl(message.body)
        .then((url) => {
          if (!cancelled) setVoiceNoteUrls((current) => ({ ...current, [message.id]: url }));
        })
        .catch(() => {
          if (!cancelled) {
            setVoiceNoteUrlErrors((current) => new Set(current).add(message.id));
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [sosActivityId, sosMessages]);

  const sosRoomPeople = useMemo(() => {
    const people = new Map<string, { name: string; avatar: string | null; role: string }>();
    if (sosRoom) {
      people.set(sosRoom.owner_id, {
        name: sosRoom.sender_name,
        avatar: sosRoom.sender_avatar_url,
        role: "owner",
      });
      for (const participant of sosRoom.participants) {
        people.set(participant.user_id, {
          name: participant.name,
          avatar: participant.avatar_url,
          role: participant.role,
        });
      }
    }
    return people;
  }, [sosRoom]);
  const sosParticipants = useMemo(
    () => buildSosParticipantStrip(sosIsActive || sosRoom ? sosRoom : null),
    [sosIsActive, sosRoom],
  );
  const [highlightedJoinerId, setHighlightedJoinerId] = useState<string | null>(null);
  const isSosConversationOwner = Boolean(
    threadContext?.is_owner || (sosRoom && user?.id && sosRoom.owner_id === user.id),
  );
  const responderJoin = useResponderJoinedNotifications({
    enabled: Boolean(sosIsActive && sosActivityId),
    isOwner: isSosConversationOwner,
    ownerId: sosRoom?.owner_id ?? user?.id ?? null,
    participants: sosParticipants,
    onHighlight: (userId) => {
      setHighlightedJoinerId(userId);
      window.setTimeout(() => {
        setHighlightedJoinerId((current) => (current === userId ? null : current));
      }, 4500);
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        try {
          if ("Notification" in window && Notification.permission === "granted") {
            const person = sosParticipants.find((item) => item.id === userId);
            if (person) {
              new Notification("Responder joined your emergency", {
                body: `${person.name} has joined the conversation.`,
                tag: `sos-join-${userId}`,
              });
            }
          }
        } catch {
          /* optional system notification */
        }
      }
    },
  });
  const visibleSosMessages = useMemo(() => {
    const allowed = sosMessages.filter((message) =>
      ["user_message", "voice_note", "participant_joined", "system"].includes(message.event_type),
    );
    // Deduplicate join / SOS system notices that can be recorded more than once.
    const seen = new Set<string>();
    return allowed.filter((message) => {
      if (message.event_type === "user_message" || message.event_type === "voice_note") {
        return true;
      }
      const key = `${message.event_type}:${message.author_id ?? ""}:${message.body}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [sosMessages]);

  useEffect(() => {
    if (status === "ready" || status === "error") setServerProgress([]);
  }, [status]);

  // Recover silent/empty Allma bubbles so the user always gets a usable reply or retry.
  useEffect(() => {
    if (status !== "ready" && status !== "error") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (assistantHasVisibleText(last.parts as Array<{ type: string; text?: string }>)) return;
    const hasUsefulTool = (last.parts ?? []).some((part) => {
      const type = String((part as { type?: string }).type ?? "");
      if (!type.startsWith("tool-")) return false;
      return shouldShowToolOutput(
        type,
        (part as { output?: Record<string, unknown> }).output,
      );
    });
    if (hasUsefulTool) return;
    setMessages((current) => {
      const tip = current[current.length - 1];
      if (!tip || tip.id !== last.id || tip.role !== "assistant") return current;
      if (assistantHasVisibleText(tip.parts as Array<{ type: string; text?: string }>)) {
        return current;
      }
      return [
        ...current.slice(0, -1),
        {
          ...tip,
          parts: [
            ...tip.parts,
            {
              type: "text",
              text: "I could not finish that answer. Please try again, or tell me more about what you need — first aid, reporting, or nearby help.",
            },
          ],
        },
      ];
    });
  }, [messages, setMessages, status]);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    focusInput();
  }, [focusInput, threadId]);

  useEffect(() => {
    if (status === "ready") focusInput();
  }, [status, focusInput]);

  const joinedResponderCount = useMemo(
    () => (sosRoom?.participants ?? []).filter((person) => person.user_id !== sosRoom?.owner_id).length,
    [sosRoom],
  );

  useEffect(() => {
    // Private AI chats stay on Allma. SOS keeps the user's explicit selection.
    if (!sosIsActive && composerRecipient !== "allma") {
      setComposerRecipient("allma");
    }
  }, [composerRecipient, sosIsActive]);

  const responderDefaultThreadRef = useRef<string | null>(null);
  useEffect(() => {
    // A responder opening the room usually wants the people in it, not the
    // AI — start them on the shared chat; they can switch to Allma AI.
    if (!sosIsActive || threadContext?.is_owner !== false || !threadId) return;
    if (responderDefaultThreadRef.current === threadId) return;
    responderDefaultThreadRef.current = threadId;
    setComposerRecipient("responders");
  }, [sosIsActive, threadContext?.is_owner, threadId]);

  // Typing indicators for the shared emergency conversation: while someone
  // types, their client broadcasts a lightweight "typing" ping on a
  // per-thread realtime channel; everyone else shows "… is typing" until
  // the pings stop (4.5s without one clears the name).
  const [typists, setTypists] = useState<Record<string, { name: string; at: number }>>({});
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingActiveRef = useRef(false);
  const lastTypingSentRef = useRef(0);
  const sosRoomId = sosRoom?.sos_activity_id ?? null;
  const myTypingName =
    (user?.id ? sosRoomPeople.get(user.id)?.name : undefined) ??
    (user?.user_metadata?.full_name as string | undefined) ??
    "Someone";

  useEffect(() => {
    if (!threadId || !sosRoomId || !user?.id) return;
    const channel = supabase.channel(`chat-typing:${threadId}`, {
      config: { broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "typing" }, (message) => {
      const payload = message.payload as { user_id?: string; name?: string; typing?: boolean };
      if (!payload?.user_id || payload.user_id === user.id) return;
      setTypists((current) => {
        const next = { ...current };
        if (payload.typing) next[payload.user_id!] = { name: payload.name || "Someone", at: Date.now() };
        else delete next[payload.user_id!];
        return next;
      });
    });
    channel.subscribe();
    typingChannelRef.current = channel;
    return () => {
      typingChannelRef.current = null;
      void supabase.removeChannel(channel);
      setTypists({});
    };
  }, [threadId, sosRoomId, user?.id]);

  useEffect(() => {
    if (!Object.keys(typists).length) return;
    const timer = window.setInterval(() => {
      setTypists((current) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(current).filter(([, v]) => now - v.at < 4500));
        return Object.keys(next).length === Object.keys(current).length ? current : next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [typists]);

  useEffect(() => {
    const channel = typingChannelRef.current;
    if (!channel || !user?.id) return;
    const sendState = (typing: boolean) => {
      void channel.send({
        type: "broadcast",
        event: "typing",
        payload: { user_id: user.id, name: myTypingName, typing },
      });
    };
    if (composerText.trim()) {
      const now = Date.now();
      if (!typingActiveRef.current || now - lastTypingSentRef.current > 2500) {
        typingActiveRef.current = true;
        lastTypingSentRef.current = now;
        sendState(true);
      }
    } else if (typingActiveRef.current) {
      typingActiveRef.current = false;
      sendState(false);
    }
  }, [composerText, user?.id, myTypingName]);

  const typingLabel = (() => {
    const names = Object.values(typists).map((t) => t.name.trim().split(/\s+/)[0]).filter(Boolean);
    if (!names.length) return null;
    if (names.length === 1) return `${names[0]} is typing`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
    return "Several people are typing";
  })();

  const send = useCallback(
    (text: string, overrideAttachments?: Attachment[]) => {
      const trimmed = text.trim();
      const files = overrideAttachments ?? attachments;
      // During an SOS everyone in the room — the person in need and the
      // responders alike — chooses where a message goes with the composer
      // selector: Allma AI, or the shared emergency chat.
      const recipient: ChatRecipient =
        sosIsActive && composerRecipient === "responders" ? "responders" : "allma";

      // Responder-directed turns stay available even while Allma is streaming.
      if ((!trimmed && files.length === 0) || (busy && recipient === "allma")) return;
      if (
        threadId &&
        threadContext &&
        !threadContext.is_owner &&
        !threadContext.sos_active
      ) {
        toast.error("Only the conversation owner can send after the emergency ends.");
        return;
      }

      const parts: UIMessage["parts"] = [];
      const hasImage = files.some((a) => a.mediaType.startsWith("image/"));
      const caption =
        trimmed ||
        (hasImage
          ? "I took a photo of an injury that may be bleeding. Please look at the photo carefully, tell me what you see, and give clear first-aid steps right away."
          : "Here is the file.");
      // Durable recipient intent (explicit metadata — never inferred from text).
      parts.push({
        type: "data-chat-recipient",
        data: { recipient },
      } as UIMessage["parts"][number]);
      parts.push({ type: "text", text: caption });

      for (const attachment of files) {
        parts.push({
          type: "file",
          mediaType: attachment.mediaType,
          filename: attachment.name,
          url: attachment.url,
        });
      }

      // Human-only SOS turn: same canonical thread, no /api/chat, no Allma model call.
      if (recipient === "responders") {
        if (!threadId || !user?.id) {
          toast.error("Sign in and keep this emergency chat open to message responders.");
          return;
        }
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `responder-${Date.now()}`;
        const localMessage = {
          id,
          role: "user" as const,
          parts,
          authorId: user.id,
          recipient,
          metadata: { recipient },
          createdAt: new Date().toISOString(),
        } as UIMessage;
        setMessages((current) => [...current, localMessage]);
        void persistConversationMessages(threadId, [
          {
            id,
            role: "user",
            parts,
            authorId: user.id,
            recipient,
          },
        ])
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: ["thread-messages", threadId] });
          })
          .catch((persistError) => {
            console.error("Responder message failed to publish", persistError);
            toast.error(
              persistError instanceof Error
                ? persistError.message
                : "Message could not be sent to responders.",
            );
          });
        if (joinedResponderCount === 0) {
          toast.message("No responder has joined yet — they will see this once they answer the SOS.");
        }
        setAttachments([]);
        setAttachMenuOpen(false);
        focusInput();
        return;
      }

      void sendMessage({
        role: "user",
        parts,
        metadata: { recipient: "allma" },
      } as Parameters<typeof sendMessage>[0]);
      setAttachments([]);
      setAttachMenuOpen(false);
      focusInput();
    },
    [
      attachments,
      busy,
      composerRecipient,
      focusInput,
      joinedResponderCount,
      queryClient,
      sendMessage,
      setMessages,
      sosIsActive,
      threadContext,
      threadId,
      user?.id,
    ],
  );

  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !initialPrompt || messages.length > 0 || sosIsActive) return;
    seeded.current = true;
    send(initialPrompt);
  }, [initialPrompt, messages.length, send, sosIsActive]);

  const {
    recording,
    transcribing,
    toggle: toggleVoice,
    cancel: cancelVoice,
    level,
    seconds,
  } = useVoiceInput({
    onTranscript: (text) => {
      const field = textareaRef.current;
      if (!field) return;
      field.value = field.value ? `${field.value} ${text}` : text;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      setComposerText(field.value);
      autoGrowTextarea(field);
      focusInput();
    },
    onError: (message) => toast.error(message),
  });

  useEffect(() => {
    if (sosIsActive && recording) cancelVoice();
  }, [cancelVoice, recording, sosIsActive]);

  // Images are inlined as compressed data URLs so the assistant always receives
  // the pixels instead of depending on a link fetch of a private storage object.
  const inlineImage = useCallback(async (file: File) => {
    const readAsDataUrl = () =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
        reader.readAsDataURL(file);
      });

    try {
      const bitmap = await Promise.race([
        createImageBitmap(file),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error("createImageBitmap timed out")), 4000),
        ),
      ]);
      const maxEdge = 1280;
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      return canvas.toDataURL("image/jpeg", 0.82);
    } catch (error) {
      console.warn("[allma-upload] createImageBitmap failed, using FileReader", error);
      const dataUrl = await readAsDataUrl();
      if (!dataUrl.startsWith("data:image/")) {
        throw error instanceof Error ? error : new Error("Image read failed");
      }
      return dataUrl;
    }
  }, []);

  const uploadFiles = useCallback(
    async (files: FileList | File[] | null) => {
      // Snapshot immediately — clearing the <input> empties a live FileList.
      const queue = files ? Array.from(files) : [];
      if (queue.length === 0) return;
      let userId: string | undefined;
      try {
        const authResult = await Promise.race([
          supabase.auth.getUser(),
          new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 2500)),
        ]);
        userId = authResult?.data.user?.id;
      } catch {
        // Guest photo uploads still work without a session.
      }

      setUploading(true);
      setAttachMenuOpen(false);
      const ready: Attachment[] = [];
      try {
        for (const file of queue) {
          if (file.size === 0) {
            toast.error(`${file.name} is empty — try picking it again.`);
            continue;
          }
          if (file.size > 20 * 1024 * 1024) {
            toast.error(`${file.name} is larger than 20MB. Try a smaller file.`);
            continue;
          }
          const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(file.name);
          if (!userId && !isImage) {
            toast.error("Sign in to attach files other than photos.");
            continue;
          }

          let url: string | null = null;
          let path = `guest/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;

          if (isImage) {
            try {
              url = await inlineImage(file);
            } catch (error) {
              console.error("Image inlining failed", error);
            }
          }

          if (userId) {
            // Keep a durable copy in storage for the report record.
            path = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
            const { error: uploadError } = await supabase.storage
              .from("evidence")
              .upload(path, file, { contentType: file.type || "application/octet-stream" });
            if (uploadError) {
              console.error(uploadError);
              if (!url) {
                toast.error(`Could not upload ${file.name}: ${uploadError.message}`);
                continue;
              }
            } else {
              evidencePathsRef.current = [
                ...evidencePathsRef.current,
                { path, mediaType: file.type || "application/octet-stream" },
              ];
              if (!url) {
                const { data: signed, error: signError } = await supabase.storage
                  .from("evidence")
                  .createSignedUrl(path, 3600);
                if (signError || !signed?.signedUrl) {
                  toast.error(`Could not attach ${file.name}. Please try again.`);
                  continue;
                }
                url = signed.signedUrl;
              }
            }
          }

          if (!url) {
            toast.error(`Could not attach ${file.name}. Please try again.`);
            continue;
          }

          const mediaType = url.startsWith("data:image/")
            ? (url.slice(5, url.indexOf(";")) || "image/jpeg")
            : isImage
              ? file.type || "image/jpeg"
              : file.type || "application/octet-stream";

          ready.push({
            id: path,
            name: file.name,
            mediaType,
            url,
            preview: URL.createObjectURL(file),
          });
        }

        if (ready.length === 0) return;

        const onlyImages = ready.every((item) => item.mediaType.startsWith("image/"));
        const typedCaption = (textareaRef.current?.value ?? composerText).trim();
        if (onlyImages && !busy) {
          // Send injury/scene photos immediately so Allma can look at them and give first aid.
          send(typedCaption, ready);
          setComposerText("");
          if (textareaRef.current) {
            textareaRef.current.value = "";
            textareaRef.current.style.height = "";
          }
        } else {
          setAttachments((current) => [...current, ...ready]);
        }
      } catch (error) {
        console.error("Attachment failed", error);
        toast.error(
          error instanceof Error ? `Attachment failed: ${error.message}` : "Attachment failed.",
        );
      } finally {
        setUploading(false);
      }
    },
    [busy, composerText, inlineImage, send],
  );

  const isEmpty = messages.length === 0;
  const lastMsg = messages[messages.length - 1];
  const timelineItems = useMemo<TimelineItem[]>(() => {
    const chatItems: TimelineItem[] = messages.map((message, msgIndex) => {
      const createdAt = (message as UIMessage & { createdAt?: string | Date }).createdAt;
      return {
        kind: "chat",
        message,
        msgIndex,
        timestamp: createdAt ? new Date(createdAt).getTime() : Date.now() + msgIndex,
      };
    });
    const sosItems: TimelineItem[] = visibleSosMessages.map((message) => ({
      kind: "sos",
      message,
      timestamp: new Date(message.created_at).getTime(),
    }));
    return [...chatItems, ...sosItems].sort((left, right) => left.timestamp - right.timestamp);
  }, [messages, visibleSosMessages]);

  // Bodies of room-timeline notices (joined / SOS state). A system notice
  // that exists in both stores renders once — as the room timeline's pill.
  const sosNoticeBodies = useMemo(
    () =>
      new Set(
        visibleSosMessages
          .filter((m) => m.event_type !== "user_message" && m.event_type !== "voice_note")
          .map((m) => m.body.trim()),
      ),
    [visibleSosMessages],
  );

  // Contextual chips come from the ::suggest marker in the last assistant reply
  // (legacy threads fall back to the old suggest_replies tool output).
  const contextualChips = useMemo(() => {
    if (busy || isEmpty || status !== "ready" || lastMsg?.role !== "assistant") return [];
    const parts = (lastMsg.parts ?? []) as ToolPart[];
    const rawText = parts
      .filter((p) => p.type === "text")
      .map((p) => String((p as unknown as { text?: string }).text ?? ""))
      .join("\n");
    const markers = parseAllmaMarkers(rawText);

    // Inline markers win: they were written for exactly this step.
    if (markers.suggestions.length > 0) return markers.suggestions.slice(0, 4);
    if (markers.media) {
      if (markers.media.mediaType === "location") {
        return [{ label: "Share my location", prompt: LOCATION_CHIP }];
      }
      const chips: Suggestion[] = [
        {
          label: markers.media.mediaType === "photo" ? "Attach a photo" : "Attach a file",
          prompt: ATTACH_CHIP,
        },
      ];
      if (markers.media.optional) chips.push({ label: "Skip for now", prompt: "Skip for now" });
      return chips;
    }

    // An emergency reply without chips still gets its Yes/No follow-up answers.
    const replyIncident = incidentForReply(messages, messages.length - 1);
    if (replyIncident && !LOCATION_ASK.test(markers.text)) {
      return replyIncident.followUpChips.map((label) => ({ label, prompt: label }));
    }

    const flowActive =
      Boolean(markers.flow) ||
      messages.some((m) => {
        const mParts = (m.parts ?? []) as ToolPart[];
        if (
          mParts.some(
            (p) =>
              p.type === "tool-ask_structured_question" &&
              (p.output as { ok?: boolean } | undefined)?.ok === true,
          )
        ) {
          return true;
        }
        if (m.role !== "assistant") return false;
        const t = mParts
          .filter((p) => p.type === "text")
          .map((p) => String((p as unknown as { text?: string }).text ?? ""))
          .join("\n");
        return Boolean(parseAllmaMarkers(t).flow);
      });


    // A live step question owns the chip row — its options are the answers.
    const stepPart = [...parts]
      .reverse()
      .find(
        (p) =>
          p.type === "tool-ask_structured_question" &&
          (p.output as { ok?: boolean } | undefined)?.ok === true,
      ) as ToolPart | undefined;
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

    // A media request owns the chip row: attach or skip.
    const mediaPart = [...parts]
      .reverse()
      .find(
        (p) =>
          p.type === "tool-request_media" &&
          (p.output as { ok?: boolean } | undefined)?.ok === true,
      ) as ToolPart | undefined;
    if (mediaPart) {
      const media = mediaPart.output as
        { media_type?: string; optional?: boolean } | undefined;
      if (media?.media_type !== "location") {
        const chips: Suggestion[] = [
          { label: media?.media_type === "photo" ? "Attach a photo" : "Attach a file", prompt: ATTACH_CHIP },
        ];
        if (media?.optional) chips.push({ label: "Skip for now", prompt: "Skip for now" });
        return chips;
      }
    }

    // The assistant asked where the user is: always give a one-tap GPS share.
    const assistantText = markers.text;

    const locationChip: Suggestion[] = LOCATION_ASK.test(assistantText)
      ? [{ label: "Share my location", prompt: LOCATION_CHIP }]
      : [];

    const suggestionPart = [...parts].reverse().find((p) => p.type === "tool-suggest_replies") as
      ToolPart | undefined;
    const output = suggestionPart?.output as
      { suggestions?: Array<{ label: string; prompt: string }> } | undefined;
    const suggestions = ((output?.suggestions ?? []) as Suggestion[]).slice(0, 4);
    if (suggestions.length > 0 || locationChip.length > 0) {
      return [...locationChip, ...suggestions].slice(0, 4);
    }

    // The assistant asked something in prose without options: derive the answers
    // from the question itself. The broad idle menu is only for an empty chat.
    if (/\?/.test(assistantText)) {
      const derived = STEP_FALLBACK_CHIPS.find(({ matches }) => matches.test(assistantText));
      if (derived) return derived.chips;
      // Mid-flow a question must never be a dead end — always leave a way forward.
      if (flowActive) {
        return [
          { label: "Yes", prompt: "Yes" },
          { label: "No", prompt: "No" },
          { label: "I don't know", prompt: "I don't know" },
        ];
      }
      return [];
    }
    return flowActive || isEmpty ? [] : IDLE_CHIPS;


  }, [busy, isEmpty, status, lastMsg, messages]);


  const showChips = contextualChips.length > 0;

  const lastMessage = messages[messages.length - 1];
  const streamingParts =
    lastMessage?.role === "assistant" ? (lastMessage.parts as Array<{ type: string; state?: string; text?: string; data?: unknown }>) : undefined;
  const progressSteps = chatProgressSteps({
    status,
    hasVisibleText: assistantHasVisibleText(streamingParts),
    serverSteps: [
      ...serverProgress,
      ...progressStepsFromParts(streamingParts),
    ].filter((step, index, all) => all.indexOf(step) === index),
    findFacilities: findFacilitiesProgress(streamingParts),
  });

  // If the user opened with a concrete request, drop any "I'm Allma Safety AI"
  // lead-in from replies so the answer starts on topic.
  const suppressGreeting = useMemo(() => {
    const firstUser = messages.find((m) => m.role === "user");
    if (!firstUser) return false;
    const text = (firstUser.parts ?? [])
      .map((p) => ("text" in p && typeof p.text === "string" ? p.text : ""))
      .join(" ");
    return INTENT_OPENER.test(text);
  }, [messages]);


  // Photo asks open the camera/gallery picker straight away; other media use the menu.
  const openAttach = useCallback((mediaType?: string) => {
    if (mediaType === "photo" && attachInputRef.current) {
      attachInputRef.current.accept = "image/*";
      attachInputRef.current.removeAttribute("capture");
      attachInputRef.current.click();
      return;
    }
    setAttachMenuOpen(true);
  }, []);

  const pickAttachmentOption = useCallback((opt: (typeof ATTACHMENT_OPTIONS)[number]) => {
    if (!attachInputRef.current) return;
    attachInputRef.current.accept = opt.accept;
    if (opt.capture) attachInputRef.current.setAttribute("capture", opt.capture);
    else attachInputRef.current.removeAttribute("capture");
    setAttachMenuOpen(false);
    attachInputRef.current.click();
  }, []);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAttachMenuOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.(".composer-attach-menu, .composer-attach-btn")) return;
      setAttachMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [attachMenuOpen]);

  const shareLocation = useCallback(() => {

    if (!("geolocation" in navigator)) {
      toast.error("Location not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        coordsRef.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        send(
          `My current location is: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
        );
      },
      () => toast.error("Location permission denied."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [send]);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const scrolledSosCardRef = useRef<string | null>(null);

  const handleSosActivityStarted = useCallback((activityId: string, card: HTMLDivElement | null) => {
    setActiveSosActivity({ id: activityId, active: true });
    if (threadId) {
      queryClient.setQueryData<ChatThreadContext | null>(
        ["chat-thread-context", threadId],
        (current) =>
          current
            ? { ...current, sos_activity_id: activityId, sos_active: true }
            : current,
      );
      void queryClient.invalidateQueries({ queryKey: ["chat-thread-context", threadId] });
      const snapshot = messagesRef.current;
      // Persist again after activation so late-arriving local turns are shared.
      void persistConversationMessages(
        threadId,
        snapshot.map((message) => ({
          id: message.id,
          role: message.role,
          parts: message.parts,
          authorId: (message as UIMessage & { authorId?: string }).authorId ?? user?.id ?? null,
          recipient: normalizeChatRecipient(
            (message as UIMessage & { recipient?: string }).recipient,
          ),
        })),
      )
        .then((inserted) => {
          if (snapshot.length > 0 && inserted === 0) {
            console.warn("SOS flush wrote 0 new rows; history may already be shared");
          }
          void queryClient.invalidateQueries({ queryKey: ["thread-messages", threadId] });
        })
        .catch((persistError) => {
          console.error("Could not flush conversation before SOS fan-out", persistError);
          toast.error("Could not share this chat history with responders. Stay on this screen.");
        });
    }
    // Scroll to the SOS card once on activation only — never on every message update.
    if (scrolledSosCardRef.current !== activityId) {
      scrolledSosCardRef.current = activityId;
      requestAnimationFrame(() =>
        card?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      );
    }
  }, [queryClient, threadId, user?.id]);

  const handleSosActivityEnded = useCallback((activityId: string) => {
    setActiveSosActivity((current) =>
      current?.id === activityId ? { ...current, active: false } : current,
    );
    if (threadId) {
      void queryClient.invalidateQueries({ queryKey: ["chat-thread-context", threadId] });
    }
  }, [queryClient, threadId]);

  const ensureSosThread = useCallback(async () => {
    const flush = async (id: string) => {
      try {
        const inserted = await persistConversationMessages(
          id,
          messages.map((message) => ({
            id: message.id,
            role: message.role,
            parts: message.parts,
            authorId: (message as UIMessage & { authorId?: string }).authorId ?? user?.id ?? null,
          })),
        );
        void queryClient.invalidateQueries({ queryKey: ["thread-messages", id] });
        if (messages.length > 0 && inserted === 0) {
          // Idempotent republish still means history is on the canonical thread.
          return;
        }
      } catch (persistError) {
        console.error("Could not persist conversation before SOS", persistError);
        toast.error("Could not save this conversation for responders. Try again before SOS.");
        throw persistError;
      }
    };

    if (threadId) {
      await flush(threadId);
      return threadId;
    }

    const openExisting = async (existingId: string) => {
      stashPendingChatMessages(existingId, messages);
      rememberActiveChatThread(existingId);
      await flush(existingId);
      if (typeof window === "undefined" || window.location.pathname !== `/chat/${existingId}`) {
        await navigate({
          to: "/chat/$threadId",
          params: { threadId: existingId },
          replace: true,
        });
      }
      return existingId;
    };

    const remembered = peekActiveChatThread();
    if (remembered) return openExisting(remembered);

    const firstUserText = messages
      .find((message) => message.role === "user")
      ?.parts.filter((part) => part.type === "text")
      .map((part) => part.text)
      .join(" ")
      .trim();
    const title = firstUserText
      ? firstUserText.replace(/\s+/g, " ").slice(0, 48)
      : "Safety conversation";
    const thread = await createThread(title);
    stashPendingChatMessages(thread.id, messages);
    rememberActiveChatThread(thread.id);
    await flush(thread.id);
    queryClient.setQueryData(["threads"], (threads: Array<{ id: string }> = []) => [
      thread,
      ...threads.filter((item) => item.id !== thread.id),
    ]);
    void queryClient.invalidateQueries({ queryKey: ["threads"] });
    await navigate({
      to: "/chat/$threadId",
      params: { threadId: thread.id },
      replace: true,
    });
    return thread.id;
  }, [messages, navigate, queryClient, threadId, user?.id]);

  const sosActivityContextValue = useMemo(
    () => ({
      threadId,
      activityId: sosActivityId,
      active: sosIsActive,
      canManage: canManageSos,
      sharedLocation:
        sosRoom?.location_shared && sosRoom.latitude != null && sosRoom.longitude != null
          ? {
              latitude: sosRoom.latitude,
              longitude: sosRoom.longitude,
              accuracy_m: sosRoom.accuracy_m,
            }
          : null,
      ownerName: sosParticipants.find((person) => person.role === "owner")?.name ?? null,
      onActivityStarted: handleSosActivityStarted,
      onActivityEnded: handleSosActivityEnded,
      onEnsureThread: ensureSosThread,
    }),
    [
      canManageSos,
      ensureSosThread,
      handleSosActivityEnded,
      handleSosActivityStarted,
      sosActivityId,
      sosIsActive,
      sosParticipants,
      sosRoom,
      threadId,
    ],
  );

  useEffect(() => {
    if (!threadId) return;
    const pending = takePendingChatMessages(threadId);
    if (!pending.length) return;
    setMessages((current) => {
      if (!current.length) return pending;
      const ids = new Set(current.map((message) => message.id));
      const missing = pending.filter((message) => !ids.has(message.id));
      return missing.length ? [...current, ...missing] : current;
    });
  }, [setMessages, threadId]);

  const sendVoiceNote = useCallback(
    async (activityId: string, clip: Blob, durationSeconds: number) => {
      if (!threadId) {
        toast.error("This voice note cannot be linked to a saved conversation.");
        return;
      }
      setSosVoiceNoteUploading(true);
      try {
        await sendSosRoomVoiceNote(activityId, threadId, clip, durationSeconds);
        await queryClient.invalidateQueries({ queryKey: ["sos-room-messages", activityId] });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Voice note not sent.");
      } finally {
        setSosVoiceNoteUploading(false);
      }
    },
    [queryClient, threadId],
  );

  const stopSosVoiceNote = useCallback((discard = false) => {
    if (discard) voiceNoteCancelledRef.current = true;
    if (voiceNoteTimerRef.current !== null) {
      window.clearInterval(voiceNoteTimerRef.current);
      voiceNoteTimerRef.current = null;
    }
    const recorder = voiceNoteRecorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    setSosVoiceNoteRecording(false);
  }, []);

  const startSosVoiceNote = useCallback(async () => {
    if (!sosActivityId || !sosIsActive || sosVoiceNoteUploading) {
      if (!sosVoiceNoteUploading) toast.error("Voice messages need this emergency conversation open.");
      return;
    }
    if (recording || transcribing) {
      toast.message("Stop voice input before recording a responder voice note.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice note recording is not supported on this device.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supportedType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
      const recorder = supportedType
        ? new MediaRecorder(stream, { mimeType: supportedType })
        : new MediaRecorder(stream);
      voiceNoteStreamRef.current = stream;
      voiceNoteRecorderRef.current = recorder;
      voiceNoteActivityIdRef.current = sosActivityId;
        voiceNoteStartedAtRef.current = Date.now();
      voiceNoteChunksRef.current = [];
      voiceNoteCancelledRef.current = false;
      setSosVoiceNoteSeconds(0);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceNoteChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const activityId = voiceNoteActivityIdRef.current;
        const chunks = voiceNoteChunksRef.current;
        const mimeType = recorder.mimeType || chunks[0]?.type || "audio/webm";
        const cancelled = voiceNoteCancelledRef.current;
        const durationSeconds = voiceNoteStartedAtRef.current
          ? Math.max(1, Math.round((Date.now() - voiceNoteStartedAtRef.current) / 1000))
          : 0;
        voiceNoteStartedAtRef.current = null;
        voiceNoteStreamRef.current?.getTracks().forEach((track) => track.stop());
        voiceNoteStreamRef.current = null;
        voiceNoteRecorderRef.current = null;
        voiceNoteActivityIdRef.current = null;
        voiceNoteChunksRef.current = [];
        voiceNoteCancelledRef.current = false;
        setSosVoiceNoteRecording(false);
        setSosVoiceNoteSeconds(0);
        if (cancelled) return;
        const clip = new Blob(chunks, { type: mimeType });
        if (!activityId || clip.size < 1000) {
          toast.error("That recording was empty — please try again.");
          return;
        }
        void sendVoiceNote(activityId, clip, durationSeconds);
      };
      recorder.start(1000);
      setSosVoiceNoteRecording(true);
      voiceNoteTimerRef.current = window.setInterval(() => {
        setSosVoiceNoteSeconds((current) => {
          const next = current + 1;
          if (next >= 120) {
            window.setTimeout(() => {
              if (voiceNoteRecorderRef.current?.state === "recording") {
                voiceNoteRecorderRef.current.stop();
              }
            }, 0);
            return 120;
          }
          return next;
        });
      }, 1000);
    } catch (error) {
      voiceNoteStreamRef.current?.getTracks().forEach((track) => track.stop());
      voiceNoteStreamRef.current = null;
      toast.error(error instanceof Error ? error.message : "Microphone access was unavailable.");
    }
  }, [
    recording,
    sendVoiceNote,
    sosActivityId,
    sosIsActive,
    sosVoiceNoteUploading,
    transcribing,
    threadId,
  ]);

  const toggleSosVoiceNote = useCallback(() => {
    if (sosVoiceNoteRecording) stopSosVoiceNote();
    else void startSosVoiceNote();
  }, [sosVoiceNoteRecording, startSosVoiceNote, stopSosVoiceNote]);

  useEffect(() => {
    if (!sosIsActive && voiceNoteRecorderRef.current?.state === "recording") {
      stopSosVoiceNote(true);
    }
  }, [sosIsActive, stopSosVoiceNote]);

  useEffect(
    () => () => {
      voiceNoteCancelledRef.current = true;
      if (voiceNoteTimerRef.current !== null) window.clearInterval(voiceNoteTimerRef.current);
      if (voiceNoteRecorderRef.current?.state === "recording") voiceNoteRecorderRef.current.stop();
      voiceNoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const composerRecording = sosIsActive ? sosVoiceNoteRecording : recording;
  const composerRecordingSeconds = sosIsActive ? sosVoiceNoteSeconds : seconds;
  const composerMicBusy = sosIsActive ? sosVoiceNoteUploading : transcribing;

  return (
    <SosActivityContext.Provider value={sosActivityContextValue}>
    <div className={cn("chat-canvas flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden", className)}>
      {/* Hidden file input for attachment sheet */}
      <input
        ref={attachInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const selected = event.target.files ? Array.from(event.target.files) : [];
          event.target.value = "";
          setAttachMenuOpen(false);
          void uploadFiles(selected);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,application/pdf"
        className="hidden"
        onChange={(event) => {
          const selected = event.target.files ? Array.from(event.target.files) : [];
          event.target.value = "";
          void uploadFiles(selected);
        }}
      />

      {activeInlineCall && sosIsActive ? (
        <div
          role="region"
          aria-label="Active emergency call"
          className="flex shrink-0 items-center gap-2 border-b border-success/25 bg-background/95 px-3 py-2 shadow-sm backdrop-blur sm:px-4"
        >
          <button
            type="button"
            onClick={() =>
              document
                .getElementById(`sos-call-${activeInlineCall.activityId}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
            aria-label="Open active emergency call details"
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-success" />
            </span>
            <Avatar name={activeInlineCall.name} url={activeInlineCall.avatarUrl ?? null} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold leading-tight text-foreground">
                {activeInlineCall.name}
              </span>
              <span className="block truncate text-[10px] leading-tight text-muted-foreground">
                {activeInlineCall.safetyRole || "Safety Network"} ·{" "}
                {activeInlineCall.status === "connected"
                  ? `${String(Math.floor(activeInlineCall.seconds / 60)).padStart(2, "0")}:${String(activeInlineCall.seconds % 60).padStart(2, "0")} connected`
                  : "Connecting"}
              </span>
            </span>
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-success">
              {activeInlineCall.status === "connected" ? "Live" : "Connecting"}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
          {activeInlineCall.status === "connected" ? (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label={activeInlineCall.muted ? "Unmute" : "Mute"}
                title={activeInlineCall.muted ? "Unmute" : "Mute"}
                onClick={() => void runSosInlineCallAction("toggleMute")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-accent"
              >
                {activeInlineCall.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <button
                type="button"
                aria-label={activeInlineCall.speaker ? "Switch to earpiece" : "Switch to speaker"}
                title={activeInlineCall.speaker ? "Speaker" : "Earpiece"}
                onClick={() => void runSosInlineCallAction("toggleSpeaker")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-accent"
              >
                {activeInlineCall.speaker ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              <button
                type="button"
                aria-label="End call"
                title="End call"
                onClick={() => void runSosInlineCallAction("hangUp")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-destructive text-destructive-foreground hover:opacity-90"
              >
                <PhoneOff className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isEmpty && visibleSosMessages.length === 0 && !sosIsActive ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]">
          <div className="mx-auto w-full px-0 pb-6 lg:px-0">
            <AssistantHero onSelect={send} />
          </div>
        </div>
      ) : (
        <Conversation
          className={cn(
            "relative min-h-0 flex-1 overscroll-contain",
            // WhatsApp-style chat wallpaper behind the shared emergency
            // conversation (and any chat with an SOS room attached).
            (sosIsActive || sosRoom) && "bg-[#ece5dd] dark:bg-[#0b141a]",
          )}
        >
          {(sosIsActive || (sosRoom && sosParticipants.some((person) => person.role !== "ai"))) ? (
            <SosFloatingChatHeads
              participants={sosParticipants}
              highlightUserId={highlightedJoinerId}
              currentUserId={user?.id ?? null}
            />
          ) : null}
          <SosResponderJoinedToast
            participant={responderJoin.current}
            onDismiss={responderJoin.dismiss}
          />
          <ConversationContent
            className={cn(
              "mx-auto w-full max-w-3xl lg:max-w-4xl lg:px-8 lg:pb-10",
              // Chat content always spans the full width — the floating chat
              // heads overlay it (Messenger-style) instead of reserving a
              // right-hand column that squeezes every bubble and card.
              "px-3",
              "pb-8",
            )}
          >
            <div className={cn("flex flex-col pt-16 lg:pt-8", sosIsActive ? "gap-4" : "gap-5")}>
              {timelineItems.map((item) => {
                if (item.kind === "sos") {
                  const mine = item.message.author_id === user?.id;
                  const person = item.message.author_id
                    ? sosRoomPeople.get(item.message.author_id)
                    : undefined;
                  return (
                    <SosTimelineEvent
                      key={item.message.id}
                      message={item.message}
                      person={person}
                      mine={mine}
                      voiceUrl={voiceNoteUrls[item.message.id]}
                      voiceUrlError={voiceNoteUrlErrors.has(item.message.id)}
                    />
                  );
                }
                const { message, msgIndex } = item;
                const noticeText = systemNoticeText(message);
                if (noticeText) {
                  // Already shown as the room timeline's pill — don't double it.
                  if (sosNoticeBodies.has(noticeText)) return null;
                  return (
                    <div
                      key={message.id}
                      className={cn("mx-auto flex max-w-[92%] items-center justify-center px-1 py-0.5", sosIsActive && "pr-[4.75rem] sm:pr-[5.5rem]")}
                    >
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/50 bg-muted/55 px-3 py-1.5 text-center text-[11px] font-medium text-muted-foreground">
                        <ShieldAlert className="h-3 w-3 shrink-0" />
                        <span className="min-w-0">{noticeText}</span>
                      </span>
                    </div>
                  );
                }
                const authorId = (message as UIMessage & { authorId?: string }).authorId;
                const isOwnUserMessage = message.role === "user" && (!authorId || authorId === user?.id);
                const author = authorId ? sosRoomPeople.get(authorId) : undefined;
                const isOtherHuman = message.role === "user" && !isOwnUserMessage;
                const emergencyMarker =
                  message.role === "assistant"
                    ? message.parts
                        .map((p) => (p.type === "text" ? parseAllmaMarkers(p.text).emergency : null))
                        .find(Boolean) ?? null
                    : null;
                const replyIncident =
                  message.role === "assistant" ? incidentForReply(messages, msgIndex) : null;
                const playbookAid =
                  message.role === "assistant" ? preferredFirstAid(replyIncident) : null;
                // Soft SOS for non-life-threatening medical; hard block only when life-threatening.
                const emergencyType =
                  emergencyMarker?.type ??
                  (replyIncident?.lifeThreatening
                    ? replyIncident.marker
                    : playbookAid
                      ? replyIncident!.marker
                      : null);
                const offerMode =
                  Boolean(emergencyMarker?.offer) ||
                  Boolean(replyIncident && !replyIncident.lifeThreatening && emergencyType);
                const wideSosLayout =
                  message.role === "assistant" && Boolean(emergencyType) && sosIsActive;
                return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                <Message
                  from={message.role}
                  className={cn(
                    message.role === "assistant"
                      ? "flex-row items-start gap-2.5"
                      : undefined,
                    wideSosLayout ? "!max-w-none w-full" : "max-w-full sm:max-w-full",
                    isOtherHuman &&
                      (sosIsActive
                        ? // WhatsApp group row: the sender's profile picture sits
                          // beside their bubble (bottom-aligned), on the left.
                          "!flex-row items-end gap-1.5 ml-0 mr-auto justify-start"
                        : "ml-0 mr-auto justify-start"),
                  )}
                >
                  {message.role === "assistant" && !wideSosLayout ? (
                    <img aria-hidden src={robotAvatar} alt="" className={cn("mt-0.5 shrink-0 rounded-full border border-border/50 bg-card object-cover shadow-sm", sosIsActive ? "h-10 w-10" : "h-8 w-8")} />
                  ) : isOtherHuman ? (
                    <span className="shrink-0">
                      <Avatar name={author?.name ?? "Responder"} url={author?.avatar ?? null} size={sosIsActive ? 40 : 32} />
                    </span>
                  ) : null}
                  <div className={cn("flex min-w-0 flex-1 flex-col gap-1.5", message.role === "user" && (isOwnUserMessage ? "items-end" : "items-start"))}>
                  <MessageContent
                    className={
                      message.role === "assistant"
                        ? wideSosLayout
                          ? "w-full max-w-none rounded-none border-0 bg-transparent p-0 shadow-none"
                          : cn("w-full max-w-[92%] rounded-[1.35rem] border-0 px-3.5 py-3 sm:max-w-[85%]", sosIsActive ? "rounded-tl-md bg-card shadow-sm ring-1 ring-border/60" : "bg-muted shadow-none")
                        : cn(
                            "w-fit max-w-[85%] rounded-none bg-transparent p-0 shadow-none sm:max-w-[80%]",
                            isOwnUserMessage ? "ml-auto" : "mr-auto",
                          )
                    }
                  >
                    {message.role === "assistant" && sosIsActive && !wideSosLayout ? (
                      <span className="mb-1 block text-[13px] font-bold text-primary">Allma AI</span>
                    ) : null}
                    {(() => {
                      if (message.role !== "assistant") return null;
                      const type = emergencyType;
                      const streaming = busy && msgIndex === messages.length - 1;
                      const allText = message.parts.map((p) => (p.type === "text" ? parseAllmaMarkers(p.text).text : "")).join("\n");
                      // Always prefer the canonical playbook card — never stack model steps under it.
                      const aid = playbookAid ?? firstAidFallback(replyIncident, allText);
                      const followUp = !streaming && aid && replyIncident ? replyIncident.followUp : null;
                      if (aid && hasNotDoctorLine(allText)) aid.notDoctor = null;
                      const showProgress =
                        streaming &&
                        progressSteps &&
                        !assistantHasVisibleText(message.parts as Array<{ type: string; text?: string }>) &&
                        !aid;
                      return type || aid || showProgress ? (
                        <div className={cn("space-y-3", !wideSosLayout && "mb-3")}>
                          {type ? <EmergencyActions type={type} offerMode={offerMode} /> : null}
                          {aid ? <FirstAidCard aid={aid} followUp={followUp} /> : null}
                          {showProgress && progressSteps ? <ChatProgressChecklist steps={progressSteps} /> : null}
                        </div>
                      ) : null;
                    })()}
                    <IncidentContext.Provider value={message.role === "assistant" ? incidentForReply(messages, msgIndex) : null}>
                    <HasPlacesContext.Provider value={message.role === "assistant" && messageHasPlaces(message.parts as never)}>
                    <EmergencyShownContext.Provider value={message.role === "assistant" && Boolean(emergencyType)}>
                    {(() => {
                      // Text parts with a repeated block (steps written before AND after the place cards) render it once.
                      const raw = message.parts.map((p) => (p.type === "text" ? parseAllmaMarkers(p.text).text : ""));
                      const deduped = message.role === "assistant"
                        ? dedupeRepeatedParts(raw)
                            .map(stripFillerSentences)
                            .map((t) => stripDuplicateFirstAidProse(t, replyIncident))
                        : raw;
                      return message.parts.map((part, index) => {
                      if ((part as { type?: string }).type === "data-chat-recipient") {
                        return null;
                      }
                      if (part.type === "text") {
                        if (message.role !== "assistant") {
                          return (
                            <div
                              key={index}
                              className={cn(
                                "flex max-w-full flex-col",
                                isOwnUserMessage ? "items-end" : "items-start",
                              )}
                            >
                              <p
                                className={cn(
                                  "max-w-full whitespace-pre-wrap px-3.5 py-2.5 text-[15px] leading-[1.55]",
                                  sosIsActive && "relative",
                                  isOwnUserMessage
                                    ? sosIsActive
                                      ? // WhatsApp-style own bubble: soft green.
                                        "rounded-[1.4rem] rounded-br-md bg-[#d9fdd3] text-foreground shadow-sm ring-1 ring-black/5 dark:bg-[#005c4b] dark:text-[#e9edef] dark:ring-white/10"
                                      : "rounded-[1.4rem] rounded-br-md bg-primary/15 text-foreground shadow-sm ring-1 ring-primary/20"
                                    : "rounded-[1.4rem] rounded-bl-md bg-card text-foreground shadow-sm ring-1 ring-border/60",
                                )}
                              >
                                {sosIsActive && !isOwnUserMessage ? (
                                  <span className={cn("mb-0.5 block text-[13px] font-bold", sosNameColor(author?.name ?? "Responder"))}>
                                    {author?.name ?? "Responder"}
                                  </span>
                                ) : null}
                                {part.text}
                                {sosIsActive ? (
                                  <span className="mt-1 block text-right text-[10px] leading-none text-muted-foreground" suppressHydrationWarning>
                                    {new Date((message as { createdAt?: string | Date }).createdAt ?? Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                                  </span>
                                ) : null}
                              </p>
                              {!sosIsActive ? (
                                <span className="mt-1 text-[11px] leading-none text-muted-foreground" suppressHydrationWarning>
                                  {new Date((message as { createdAt?: string | Date }).createdAt ?? Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                                </span>
                              ) : null}
                            </div>
                          );
                        }
                        const parsed = parseAllmaMarkers(part.text);
                        const partText = deduped[index] ?? parsed.text;
                        const text = suppressGreeting
                          ? partText.replace(GREETING_LEAD, "").trimStart() || partText
                          : partText;
                        return (
                          <div key={index} className="space-y-3">
                            {parsed.flow ? (
                              <FlowBanner
                                flowLabel={parsed.flow.label}
                                stepTitle={parsed.flow.title || text.slice(0, 80)}
                                step={parsed.flow.step}
                                total={parsed.flow.total}
                                helper={parsed.flow.helper}
                              />
                            ) : null}
                            {text ? (
                              <MessageResponse className="chat-checklist px-0 py-0 text-base leading-[1.6] text-foreground">
                                {text}
                              </MessageResponse>
                            ) : null}
                            {parsed.media ? (
                              <MediaRequestCard
                                media={parsed.media}
                                onSend={send}
                                onOpenAttach={openAttach}
                                onShareLocation={shareLocation}
                              />
                            ) : null}
                          </div>
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
                          <FileAttachmentChip
                            key={index}
                            url={part.url}
                            filename={part.filename ?? "Attachment"}
                          />
                        );

                      }
                      if (part.type.startsWith("tool-")) {
                        // One card per tool type per message — model often doubles empties.
                        const firstOfType = message.parts.findIndex((p) => p.type === part.type);
                        if (firstOfType !== index) return null;
                        return (
                          <ToolCard
                            key={index}
                            part={part as ToolPart}
                            onSend={send}
                            onOpenAttach={openAttach}
                            onShareLocation={shareLocation}
                          />
                        );
                      }

                      return null;
                    });
                    })()}
                    </EmergencyShownContext.Provider>
                    </HasPlacesContext.Provider>
                    </IncidentContext.Provider>
                  </MessageContent>

                  {message.role === "assistant" && !(busy && msgIndex === messages.length - 1) ? (
                    <ResponseActions
                      text={message.parts.map((p) => (p.type === "text" ? parseAllmaMarkers(p.text).text : "")).join("\n").trim()}
                      onRetry={!sosIsActive && msgIndex === messages.length - 1 ? () => void regenerate() : undefined}
                    />
                  ) : null}

                  {/* Contextual suggestion chips — generated by the model for this exact step */}
                  {message.role === "assistant" &&
                    msgIndex === messages.length - 1 &&
                    showChips && (
                      <AnimatePresence>
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15, duration: 0.35 }}
                          className="mt-1 flex flex-wrap gap-2"
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
                              onClick={() => {
                                if (chip.prompt === ATTACH_CHIP) {
                                  openAttach("photo");
                                } else if (chip.prompt === LOCATION_CHIP) {
                                  shareLocation();
                                } else if (chip.prompt === "__lost_found_lost__") {
                                  navigate({ to: "/lost-found", search: { post: "lost" } });
                                } else if (chip.prompt === "__lost_found_found__") {
                                  navigate({ to: "/lost-found", search: { post: "found" } });
                                } else {
                                  send(chip.prompt);
                                }
                              }}


                              className="inline-flex max-w-full items-center whitespace-normal break-words rounded-2xl border border-border bg-background px-3.5 py-2 text-left text-[13.5px] font-medium leading-snug text-foreground/85 transition-colors hover:bg-muted hover:text-foreground"
                            >
                                                            {chip.label}
                            </motion.button>
                          ))}
                        </motion.div>
                      </AnimatePresence>
                    )}
                  </div>
                </Message>
                </motion.div>
                );
              })}
              {status === "submitted" ? (
                <div className="flex max-w-full flex-row items-start gap-2.5">
                  <img aria-hidden src={robotAvatar} alt="" className={cn("mt-0.5 shrink-0 rounded-full border border-border/50 bg-card object-cover shadow-sm", sosIsActive ? "h-10 w-10" : "h-8 w-8")} />
                  <div className="min-w-0 max-w-[92%] rounded-[1.35rem] bg-muted px-3.5 py-3 sm:max-w-[85%]">
                    {progressSteps ? (
                      <ChatProgressChecklist steps={progressSteps} />
                    ) : (
                      <span className="flex h-7 items-center gap-1" role="status" aria-label="Allma is typing">
                        {[0, 1, 2].map((d) => (
                          <span key={d} className="chat-typing-dot h-1.5 w-1.5 rounded-full bg-foreground/40" style={{ animationDelay: `${d * 0.15}s` }} />
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              ) : null}
              {error && !sosIsActive ? (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <span>Something interrupted the response.</span>
                  <button type="button" onClick={() => void regenerate()} className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 px-3 py-1 font-medium hover:bg-destructive/10">
                    <RotateCcw className="h-3.5 w-3.5" /> Try again
                  </button>
                </div>
              ) : null}
            </div>
          </ConversationContent>
          <ConversationNewMessagesButton
            messageCount={messages.length + visibleSosMessages.length}
            className="bottom-3"
          />
          <ConversationScrollButton className="bottom-3 left-auto right-3 translate-x-0 border-border/70 bg-background/95 shadow-soft" />
        </Conversation>
      )}

      <div
        className={cn(
          // Docked as the last flex child of the full-height chat column, so it
          // never floats over (and hides) the end of the conversation.
          "chat-composer-dock no-print relative z-20 w-full min-w-0 shrink-0 sm:px-4",
          sosIsActive ? "chat-composer-dock-sos px-1.5" : "px-2.5",
        )}
        data-fixed-composer={fixedComposer ? "true" : undefined}
        onPointerDownCapture={(event) => {
          if (!attachMenuOpen) return;
          const target = event.target as HTMLElement | null;
          if (target?.closest?.("[role='menu'], [aria-label='Attach files']")) return;
          setAttachMenuOpen(false);
        }}
      >
        <div className="mx-auto w-full max-w-3xl lg:max-w-4xl">
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

          {typingLabel ? (
            <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[12px] font-medium text-muted-foreground" role="status" aria-live="polite">
              <span className="flex items-end gap-[3px]" aria-hidden>
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
              </span>
              {typingLabel}…
            </p>
          ) : null}

          {sosIsActive ? (
            <ComposerRecipientSelector
              value={composerRecipient}
              onChange={setComposerRecipient}
              disabled={busy || sosVoiceNoteUploading || uploading}
              respondersJoined={joinedResponderCount}
              peopleLabel={
                threadContext?.is_owner === false
                  ? sosRoom?.sender_name
                    ? `Message ${sosRoom.sender_name.trim().split(/\s+/)[0]}`
                    : "Message the person in need"
                  : undefined
              }
              peopleHint={
                threadContext?.is_owner === false ? "The person who needs help" : undefined
              }
            />
          ) : null}

          <div className="composer-ori-row flex items-end gap-2">
            <div
              className={cn(
                "composer-shell composer-pill relative min-w-0 flex-1 focus-within:composer-shell-focused",
                composerRecording && "composer-shell-recording",
                sosIsActive && !composerRecording && "composer-shell-sos",
              )}
            >
              <AnimatePresence>
                {attachMenuOpen ? (
                  <motion.div
                    key="attach-menu"
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.16 }}
                    className="composer-attach-menu absolute bottom-[calc(100%+0.55rem)] left-0 z-40 w-[15.5rem] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-lift"
                    role="menu"
                    aria-label="Attach media"
                  >
                    {ATTACHMENT_OPTIONS.map((opt, index) => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="menuitem"
                          onClick={() => pickAttachmentOption(opt)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-[15px] font-medium text-foreground transition-colors hover:bg-muted/70",
                            index > 0 && "border-t border-border/50",
                          )}
                        >
                          <span>{opt.label}</span>
                          <Icon className="h-[18px] w-[18px] shrink-0 text-foreground" strokeWidth={1.75} />
                        </button>
                      );
                    })}
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <div className="composer-surface">
                <PromptInput
                  onSubmit={(message, event) => {
                    event.preventDefault();
                    const text = (message.text ?? "").trim();
                    if (!text && attachments.length === 0) return;
                    send(text);
                    setComposerText("");
                    event.currentTarget.reset();
                    const field = textareaRef.current;
                    if (field) field.style.height = "";
                  }}
                  className="rounded-[inherit] border-0 bg-transparent shadow-none ring-0 outline-none has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-transparent"
                >
                  <InputGroupAddon align="inline-start" className="self-end py-1 pl-1.5 has-[>button]:ml-0">
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      onClick={() => setAttachMenuOpen((open) => !open)}
                      className="composer-attach-btn"
                      aria-label="Attach files"
                      aria-expanded={attachMenuOpen}
                    >
                      <Plus className="h-5 w-5" strokeWidth={2.25} />
                    </motion.button>
                  </InputGroupAddon>

                  <PromptInputTextarea
                    ref={textareaRef}
                    placeholder={
                      sosIsActive
                        ? composerRecipient === "responders"
                          ? threadContext?.is_owner === false
                            ? "Message in this emergency…"
                            : "Message your Safety Network…"
                          : "Ask Allma in this emergency…"
                        : "Ask Allma"
                    }
                    aria-label={
                      sosIsActive
                        ? composerRecipient === "responders"
                          ? "Message responders"
                          : "Ask Allma AI"
                        : "Ask Allma"
                    }
                    enterKeyHint="send"
                    rows={1}
                    className="composer-textarea min-h-[44px] max-h-[140px] bg-transparent px-1.5 py-2.5 text-[15px] leading-6 sm:text-[15px]"
                    onFocus={() => setAttachMenuOpen(false)}
                    onChange={(event) => {
                      setComposerText(event.target.value);
                      autoGrowTextarea(event.currentTarget);
                    }}
                  />

                  <InputGroupAddon align="inline-end" className="self-end gap-1 py-1 pr-1.5 has-[>button]:mr-0">
                    {composerRecording ? (
                      <>
                        <span className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-1">
                          <span className="flex h-4 items-end gap-[2px]">
                            {[0.55, 0.9, 0.7, 1, 0.6].map((weight, index) => (
                              <span
                                key={index}
                                className="w-[3px] rounded-full bg-destructive transition-[height] duration-100"
                                style={{
                                  height: `${Math.max(3, Math.min(16, 3 + (sosIsActive ? 0.45 : level) * weight * 26))}px`,
                                }}
                              />
                            ))}
                          </span>
                          <span className="tabular-nums text-[11px] font-medium text-destructive">
                            {String(Math.floor(composerRecordingSeconds / 60)).padStart(2, "0")}:
                            {String(composerRecordingSeconds % 60).padStart(2, "0")}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => (sosIsActive ? stopSosVoiceNote(true) : cancelVoice())}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          aria-label="Discard recording"
                        >
                          <X className="h-[17px] w-[17px]" />
                        </button>
                      </>
                    ) : null}
                    {uploading || transcribing || sosVoiceNoteUploading ? (
                      <span className="pr-1 text-[11px] font-medium text-muted-foreground">
                        {uploading
                          ? "Uploading…"
                          : sosVoiceNoteUploading
                            ? "Sending voice note…"
                            : "Transcribing…"}
                      </span>
                    ) : null}
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.9 }}
                      onClick={sosIsActive ? toggleSosVoiceNote : toggleVoice}
                      disabled={composerMicBusy}
                      className={cn(
                        "composer-icon-btn disabled:opacity-60",
                        composerRecording &&
                          "mic-recording bg-info text-info-foreground hover:bg-info hover:text-info-foreground",
                      )}
                      aria-label={
                        sosIsActive
                          ? sosVoiceNoteRecording
                            ? "Stop voice message recording"
                            : "Record a voice message"
                          : recording
                            ? "Stop recording"
                            : "Voice input"
                      }
                    >
                      {composerMicBusy ? (
                        <Loader2 className="h-[17px] w-[17px] animate-spin" />
                      ) : composerRecording ? (
                        <MicOff className="h-5 w-5" />
                      ) : (
                        <Mic className="h-5 w-5" />
                      )}
                    </motion.button>
                  </InputGroupAddon>
                </PromptInput>
              </div>
            </div>

            {composerRecording && sosIsActive ? (
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={() => stopSosVoiceNote()}
                aria-label="Send voice message"
                className="composer-voice-btn"
              >
                <SendHorizontal className="h-5 w-5" />
              </motion.button>
            ) : !composerRecording ? (
              busy ? (
                <button
                  type="button"
                  onClick={() => void stop()}
                  aria-label="Stop generating"
                  className="composer-voice-btn"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : composerText.trim().length > 0 || attachments.length > 0 ? (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.92 }}
                  disabled={sosVoiceNoteUploading || uploading}
                  aria-label={
                    sosIsActive
                      ? composerRecipient === "responders"
                        ? "Send to Safety Responders"
                        : "Send to Allma AI"
                      : "Send message"
                  }
                  className="composer-voice-btn disabled:opacity-60"
                  onClick={() => {
                    const text = composerText.trim();
                    send(text);
                    setComposerText("");
                    const field = textareaRef.current;
                    if (field) {
                      field.value = "";
                      field.style.height = "";
                    }
                  }}
                >
                  <SendHorizontal className="h-5 w-5" />
                </motion.button>
              ) : sosIsActive ? (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.92 }}
                  onClick={toggleSosVoiceNote}
                  disabled={sosVoiceNoteUploading}
                  className="composer-voice-btn disabled:opacity-60"
                  aria-label="Record a voice message"
                >
                  <Mic className="h-5 w-5" />
                </motion.button>
              ) : (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setVoiceMode("on")}
                  className="composer-voice-btn"
                  aria-label="Open voice mode"
                >
                  <AudioLines className="h-5 w-5" strokeWidth={2.25} />
                </motion.button>
              )
            ) : null}
          </div>
        </div>
      </div>
    </div>
    </SosActivityContext.Provider>
  );
}

function ResponseActions({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  if (!text) return null;
  const btn = "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent/40";
  const listen = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(text.replace(/[*#_`>]/g, ""));
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={btn}
        aria-label={copied ? "Copied" : "Copy response"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard unavailable */
          }
        }}
      >
        {copied ? <Check className="h-4 w-4 text-chat-accent" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
      </button>
      {onRetry ? (
        <button type="button" className={btn} aria-label="Retry response" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" /> Retry
        </button>
      ) : null}
      <button type="button" className={btn} aria-label={speaking ? "Stop reading" : "Listen to response"} onClick={listen}>
        {speaking ? <Square className="h-3.5 w-3.5 fill-current" /> : <Volume2 className="h-4 w-4" />} {speaking ? "Stop" : "Listen"}
      </button>
    </div>
  );
}
