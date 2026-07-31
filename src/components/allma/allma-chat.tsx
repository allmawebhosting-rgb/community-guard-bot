import { useCallback, useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { toast } from "sonner";
import { Camera, FileText, MapPin, Megaphone, Mic, Paperclip } from "lucide-react";
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
import { BrandMark } from "@/components/allma/brand";
import { QuickActionGrid } from "@/components/allma/quick-actions";
import { supabase } from "@/integrations/supabase/client";
import { DISCLAIMER } from "@/lib/allma";
import { cn } from "@/lib/utils";

type ToolPart = {
  type: string;
  state?: string;
  output?: unknown;
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
  className,
}: {
  threadId: string | null;
  initialMessages?: UIMessage[];
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  useEffect(() => {
    focusInput();
  }, [focusInput, threadId]);

  useEffect(() => {
    if (status === "ready") focusInput();
  }, [status, focusInput]);

  const send = useCallback(
    (text: string) => {
      if (!text.trim() || busy) return;
      void sendMessage({ text: text.trim() });
      focusInput();
    },
    [busy, sendMessage, focusInput],
  );

  const isEmpty = messages.length === 0;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl px-4 pb-6">
          {isEmpty ? (
            <div className="rise-in flex flex-col gap-6 pt-8 sm:pt-12">
              <div className="hero-glow -mx-4 rounded-3xl px-4 py-10 relative overflow-hidden">
                {/* Subtle animated gradient orbs */}
                <div className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl animate-pulse-slow" />
                <div className="pointer-events-none absolute -bottom-8 -left-8 h-36 w-36 rounded-full bg-primary-glow/10 blur-2xl animate-pulse-slow [animation-delay:1.2s]" />
                <div className="relative">
                  <BrandMark className="h-14 w-14 shadow-lift" />
                  <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
                    Hello, I&apos;m{" "}
                    <span className="brand-gradient-text">Allma Safety AI</span>.
                    <br />
                    How can I help you today?
                  </h1>
                  <p className="mt-3 max-w-lg text-sm text-muted-foreground">
                    Tell me what happened in your own words. I&apos;ll guide you step by step —
                    filing a report, finding help, or keeping you safe.
                  </p>
                </div>
              </div>
              <QuickActionGrid onSelect={send} />
              <p className="text-[11px] leading-relaxed text-muted-foreground">{DISCLAIMER}</p>
            </div>
          ) : (
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
          {/* Glow ring sits outside; PromptInput strips its own border */}
          <div className="input-glow-ring">
            <PromptInput
              onSubmit={(message, event) => {
                event.preventDefault();
                send(message.text ?? "");
                event.currentTarget.reset();
              }}
              className="rounded-[2rem] bg-card border-0 shadow-none"
            >
              {/* Left icons — inline */}
              <InputGroupAddon align="inline-start" className="gap-0.5 pl-2">
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Add photo"
                >
                  <Camera className="h-[17px] w-[17px]" />
                </button>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Attach file"
                >
                  <Paperclip className="h-[17px] w-[17px]" />
                </button>
              </InputGroupAddon>

              {/* Textarea fills the middle */}
              <PromptInputTextarea
                ref={textareaRef}
                autoFocus
                placeholder="Describe what's happening…"
                className="bg-transparent min-h-[2.75rem] py-3"
              />

              {/* Right icons — inline */}
              <InputGroupAddon align="inline-end" className="gap-0.5 pr-2">
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Voice input"
                >
                  <Mic className="h-[17px] w-[17px]" />
                </button>
                <PromptInputSubmit status={status} disabled={busy} size="icon-sm" />
              </InputGroupAddon>
            </PromptInput>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">
            Verify important advice with a local expert
          </p>
        </div>
      </div>
    </div>
  );
}
