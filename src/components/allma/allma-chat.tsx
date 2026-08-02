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
  CreditCard,
  FileText,
  Flame,
  HelpCircle,
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
  Upload,
  User,
  Video,
  FileAudio,
  FileIcon,
  Navigation,
  X,
} from "lucide-react";

import { motion, AnimatePresence } from "motion/react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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


const ATTACHMENT_OPTIONS = [
  { id: "camera", icon: Camera, label: "Camera", accept: "image/*", capture: "environment" as const },
  { id: "gallery", icon: Paperclip, label: "Gallery", accept: "image/*", capture: undefined },
  { id: "video", icon: Video, label: "Video", accept: "video/*", capture: undefined },
  { id: "voice", icon: FileAudio, label: "Voice", accept: "audio/*", capture: undefined },
  { id: "document", icon: FileIcon, label: "Document", accept: "application/pdf,.doc,.docx", capture: undefined },
];

type Attachment = {
  id: string;
  name: string;
  mediaType: string;
  url: string;
  preview: string;
};

type GuidedCase = {
  type: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  question: string;
  evidence: string[];
  nextActions: string[];
};

function inferGuidedCase(prompt: string): GuidedCase | null {
  const normalized = prompt.toLowerCase();

  if (normalized.includes("fire") || normalized.includes("smoke")) {
    return {
      type: "Fire",
      priority: "Critical",
      question: "Where is the fire or smoke right now?",
      evidence: ["Photo of the scene", "Voice note of what you see", "Location sharing"],
      nextActions: ["Call fire brigade", "Move to a safe place", "Share location"],
    };
  }

  if (normalized.includes("missing") || normalized.includes("child") || normalized.includes("disappeared")) {
    return {
      type: "Missing Person",
      priority: "High",
      question: "When was the person last seen and where?",
      evidence: ["Photo of the person", "Last known clothing details", "Any contact details"],
      nextActions: ["Notify family", "Share last known location", "Contact police"],
    };
  }

  if (normalized.includes("attack") || normalized.includes("assault") || normalized.includes("gunshot") || normalized.includes("robbery")) {
    return {
      type: "High Priority Emergency",
      priority: "Critical",
      question: "Are you in immediate danger right now?",
      evidence: ["Voice note", "Photo or video", "Live location"],
      nextActions: ["Call emergency services", "Stay in a safe place", "Share location"],
    };
  }

  if (normalized.includes("accident") || normalized.includes("crash") || normalized.includes("collision")) {
    return {
      type: "Road Accident",
      priority: "High",
      question: "How many people are involved and where did the accident happen?",
      evidence: ["Photo of the scene", "Vehicle details", "Location pin"],
      nextActions: ["Call ambulance", "Notify police", "Share precise location"],
    };
  }

  if (normalized.includes("stolen") || normalized.includes("theft") || normalized.includes("phone")) {
    return {
      type: "Theft",
      priority: "Medium",
      question: "Where did the theft happen, and when did it happen?",
      evidence: ["Photo of the item", "Receipt or proof of ownership", "IMEI or serial number"],
      nextActions: ["Block SIM", "Block mobile money", "Generate report"],
    };
  }

  if (normalized.includes("hospital") || normalized.includes("ambulance")) {
    return {
      type: "Medical Help",
      priority: "Critical",
      question: "Are you experiencing a medical emergency right now?",
      evidence: ["Current location", "Symptoms or type of emergency", "Any voice details"],
      nextActions: ["Call ambulance", "Find nearest hospital", "Share location"],
    };
  }

  return null;
}

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

function ToolCard({ part, onSend }: { part: ToolPart; onSend: (text: string) => void }) {
  const name = part.type.replace(/^tool-/, "");
  const running = part.state !== "output-available" && part.state !== "output-error";
  const output = part.output as Record<string, unknown> | undefined;

  const meta: Record<string, { icon: typeof FileText; label: string; busy: string }> = {
    create_report: { icon: FileText, label: "Incident report", busy: "Filing your report…" },
    find_facilities: { icon: MapPin, label: "Nearby help", busy: "Searching the directory…" },
    list_alerts: { icon: Megaphone, label: "Community alerts", busy: "Checking alerts…" },
    ask_structured_question: { icon: HelpCircle, label: "Question", busy: "Preparing question…" },
    request_media: { icon: Upload, label: "Upload evidence", busy: "Preparing upload…" },
    recommend_actions: { icon: AlertCircle, label: "Recommended actions", busy: "Finding recommendations…" },
    report_summary: { icon: FileText, label: "Report summary", busy: "Preparing summary…" },
    my_reports: { icon: FileText, label: "Your reports", busy: "Checking your reports…" },
    match_reports: { icon: Search, label: "Possible matches", busy: "Looking for matches…" },
    recall_history: { icon: Search, label: "Earlier conversations", busy: "Recalling earlier chats…" },
    remember: { icon: Shield, label: "Saved", busy: "Noting that down…" },
    save_draft: { icon: FileText, label: "Draft saved", busy: "Saving your draft…" },
    get_draft: { icon: FileText, label: "Saved draft", busy: "Loading your draft…" },
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
    const options = Array.isArray(output.options) ? output.options : [];

    return (
      <div className="chat-card p-5">
        <div className="mb-4">
          <div className="mb-2.5 flex items-center gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Step {step}
              <span className="text-muted-foreground/50"> / {total}</span>
            </p>
            <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-border/50">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary via-primary-glow to-gold"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (step / Math.max(total, 1)) * 100)}%` }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
          <h4 className="text-base font-semibold leading-snug tracking-[-0.01em] text-foreground">{question}</h4>
          {helper ? <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{helper}</p> : null}
        </div>
        <div className="grid gap-2">
          {options.map((opt: { label: string; value: string }, index: number) => (
            <motion.button
              key={index}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              onClick={() => onSend(opt.value)}
              className="group flex items-center justify-between gap-3 rounded-2xl border border-border/40 bg-background/30 px-4 py-3.5 text-left text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/[0.06]"
            >
              <span>{opt.label}</span>
              <CheckCircle className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
            </motion.button>
          ))}
        </div>
      </div>

    );
  }

  if (name === "request_media" && output?.ok) {
    const mediaType = String(output.media_type ?? "photo");
    const prompt = String(output.prompt ?? "Please upload a photo or file.");
    const optional = Boolean(output.optional);

    return (
      <div className="chat-card p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Upload className="h-5 w-5 text-primary" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} requested</p>
            <p className="text-xs text-muted-foreground">{prompt}</p>
          </div>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Tap the <Plus className="mx-0.5 inline h-3.5 w-3.5" /> button in the composer to attach a file.
        </p>
        <div className="flex gap-2">
          {optional ? (
            <button
              type="button"
              onClick={() => onSend("Skip for now")}
              className="rounded-full border border-border/50 px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-primary/45 hover:bg-accent"
            >
              Skip for now
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onSend("I want to upload a file")}
            className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (name === "recommend_actions" && output?.ok) {
    const title = String(output.title ?? "Recommended actions");
    const actions = Array.isArray(output.actions) ? output.actions : [];

    return (
      <div className="chat-card p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {actions.map((action: { label: string; subtitle: string; icon?: string }, index: number) => {
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
          })}
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Review before submitting</p>
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

  return (
    <div className="chat-card p-3.5">
      <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" /> {entry.label}
      </p>
      {name === "create_report" && output?.ok ? (
        <div className="space-y-1 text-sm">
          <p className="font-semibold text-foreground">{String(output.title ?? "Report filed")}</p>
          <p className="text-muted-foreground">
            Reference <span className="font-mono text-foreground">{String(output.reference)}</span>{" "}
            · status {String(output.status)} · risk {String(output.risk_level)}
          </p>
        </div>
      ) : name === "find_facilities" && Array.isArray(output?.facilities) ? (
        <ul className="space-y-2 text-sm">
          {(output.facilities as Array<Record<string, unknown>>).map((facility, index) => (
            <li key={index} className="flex items-start justify-between gap-3">
              <span>
                <span className="block font-medium">{String(facility.name)}</span>
                <span className="block text-xs text-muted-foreground">
                  {String(facility.address ?? facility.district ?? "")}
                </span>
              </span>
              {facility.phone ? (
                <a
                  href={`tel:${facility.phone}`}
                  className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
                >
                  Call
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : name === "list_alerts" && Array.isArray(output?.alerts) ? (
        <ul className="space-y-2 text-sm">
          {(output.alerts as Array<Record<string, unknown>>).map((alert, index) => (
            <li key={index}>
              <span className="font-medium">{String(alert.title)}</span>
              <span className="block text-xs text-muted-foreground">
                {String(alert.area ?? "")} · {String(alert.severity)}
              </span>
            </li>
          ))}
        </ul>
      ) : (name === "my_reports" && Array.isArray(output?.reports)) ||
        (name === "match_reports" && Array.isArray(output?.matches)) ? (
        <ul className="space-y-2 text-sm">
          {((output.reports ?? output.matches) as Array<Record<string, unknown>>).map(
            (row, index) => (
              <li key={index} className="flex items-start justify-between gap-3">
                <span>
                  <span className="block font-medium">{String(row.title ?? "Report")}</span>
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
        <p className="text-sm text-muted-foreground">
          Saved — you can pick this up any time.
        </p>
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
  const [activeCase, setActiveCase] = useState<GuidedCase | null>(null);
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
        const workflow = inferGuidedCase(trimmed);
        if (workflow) setActiveCase(workflow);
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

  const { recording, transcribing, toggle: toggleVoice } = useVoiceInput({
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
    // If the turn ended with a structured question card, its options are the choices.
    if (parts.some((p) => p.type === "tool-ask_structured_question")) return [];
    const suggestionPart = [...parts]
      .reverse()
      .find((p) => p.type === "tool-suggest_replies") as ToolPart | undefined;
    const output = suggestionPart?.output as
      | { suggestions?: Array<{ label: string; prompt: string }> }
      | undefined;
    return ((output?.suggestions ?? []) as Suggestion[]).slice(0, 4);
  }, [busy, isEmpty, status, lastMsg]);

  const showChips = contextualChips.length > 0;


  const shareLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      toast.error("Location not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        send(`My current location is: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
      },
      () => toast.error("Location permission denied."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [send]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
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
          <div className="mx-auto w-full max-w-4xl px-4 pb-6">
            <AssistantHero onSelect={send} />
          </div>
        </div>
      ) : (
        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="mx-auto w-full max-w-3xl px-4 pb-6">
            {activeCase ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="chat-card mt-4 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Case detected</p>
                    <h3 className="mt-1 text-lg font-semibold text-foreground">{activeCase.type}</h3>
                  </div>
                  <span className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                    {activeCase.priority}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/50 bg-background/30 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Next question</p>
                    <p className="mt-1 text-sm text-foreground">{activeCase.question}</p>
                  </div>
                  <div className="rounded-2xl border border-border/50 bg-background/30 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Suggested evidence</p>
                    <ul className="mt-1 space-y-1 text-sm text-foreground">
                      {activeCase.evidence.map((item) => (
                        <li key={item}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-border/50 bg-background/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recommended next actions</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {activeCase.nextActions.map((action) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => send(action)}
                        className="rounded-full border border-border/60 bg-card/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-all hover:border-primary/50 hover:bg-accent hover:text-foreground"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : null}
            <div className="flex flex-col gap-6 pt-6">
              {messages.map((message, msgIndex) => (
                <Message key={message.id} from={message.role}>
                  <MessageContent className={message.role === "assistant" ? "rounded-none bg-transparent px-0 py-0" : "rounded-[1.4rem] rounded-br-sm"}>
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
                          <p key={index} className="whitespace-pre-wrap rounded-[1.4rem] rounded-br-md bg-gradient-to-br from-primary to-primary-glow px-4 py-3 text-[15px] leading-relaxed text-primary-foreground shadow-lift">
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
                        return <ToolCard key={index} part={part as ToolPart} onSend={send} />;
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
                          className="chip-scroll -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible"
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
                              className="shrink-0 whitespace-nowrap rounded-full border border-border/50 bg-card/70 px-3.5 py-1.5 text-xs font-medium text-foreground/85 shadow-soft backdrop-blur-md transition-colors hover:border-primary/50 hover:bg-accent hover:text-foreground"
                            >
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

      <div className="no-print sticky bottom-[4.9rem] z-30 glass border-t border-border/60 px-4 pb-4 pt-3">
        <div className="mx-auto w-full max-w-3xl">
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
                    recording && "bg-destructive text-destructive-foreground hover:bg-destructive",
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
