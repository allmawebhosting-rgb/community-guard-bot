import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { toast } from "sonner";
import {
  Camera,
  FileText,
  Loader2,
  MapPin,
  Megaphone,
  Mic,
  Paperclip,
  X,
} from "lucide-react";
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

type Attachment = {
  id: string;
  name: string;
  mediaType: string;
  url: string;
  preview: string;
};

function ToolCard({ part }: { part: ToolPart }) {
  const name = part.type.replace(/^tool-/, "");
  const running = part.state !== "output-available" && part.state !== "output-error";
  const output = part.output as Record<string, unknown> | undefined;

  const meta: Record<string, { icon: typeof FileText; label: string; busy: string }> = {
    create_report: { icon: FileText, label: "Incident report", busy: "Filing your report…" },
    find_facilities: { icon: MapPin, label: "Nearby help", busy: "Searching the directory…" },
    list_alerts: { icon: Megaphone, label: "Community alerts", busy: "Checking alerts…" },
  };
  const entry = meta[name] ?? { icon: FileText, label: name, busy: "Working…" };
  const Icon = entry.icon;

  if (running) {
    return <Shimmer className="text-sm">{entry.busy}</Shimmer>;
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {entry.label}
      </p>
      {name === "create_report" && output?.ok ? (
        <div className="space-y-1 text-sm">
          <p className="font-semibold">{String(output.title ?? "Report filed")}</p>
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
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);

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
      if (trimmed) parts.push({ type: "text", text: trimmed });
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

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {isEmpty ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 pb-6">
            <AssistantHero onSelect={send} />
          </div>
        </div>
      ) : (
        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="mx-auto w-full max-w-3xl px-4 pb-6">
            {

            <div className="flex flex-col gap-5 pt-6">
              {messages.map((message) => (
                <Message key={message.id} from={message.role}>
                  <MessageContent>
                    {message.parts.map((part, index) => {
                      if (part.type === "text") {
                        return message.role === "assistant" ? (
                          <MessageResponse key={index}>{part.text}</MessageResponse>
                        ) : (
                          <p key={index} className="whitespace-pre-wrap">
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
                        return <ToolCard key={index} part={part as ToolPart} />;
                      }
                      return null;
                    })}
                  </MessageContent>
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
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="no-print sticky bottom-0 z-30 glass border-t border-border/60 px-4 pb-4 pt-3">
        <div className="mx-auto w-full max-w-3xl">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              void uploadFiles(event.target.files);
              event.target.value = "";
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

          <div className="input-glow-ring">
            <PromptInput
              onSubmit={(message, event) => {
                event.preventDefault();
                send(message.text ?? "");
                event.currentTarget.reset();
              }}
              className="rounded-[2rem] bg-card border-0 shadow-none"
            >
              <InputGroupAddon align="inline-start" className="gap-0.5 pl-2">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Take a photo"
                >
                  <Camera className="h-[17px] w-[17px]" />
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Attach file"
                >
                  <Paperclip className="h-[17px] w-[17px]" />
                </button>
              </InputGroupAddon>

              <PromptInputTextarea
                ref={textareaRef}
                placeholder="Describe what's happening…"
                className="bg-transparent min-h-[2.75rem] py-3"
              />

              <InputGroupAddon align="inline-end" className="gap-0.5 pr-2">
                <button
                  type="button"
                  onClick={toggleVoice}
                  disabled={transcribing}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
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
                <PromptInputSubmit status={status} disabled={busy} size="icon-sm" />
              </InputGroupAddon>
            </PromptInput>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">
            Police Integration Ready — not officially connected to police or emergency services
          </p>
        </div>
      </div>
    </div>
  );
}
