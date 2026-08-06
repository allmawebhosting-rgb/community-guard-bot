import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BrainCircuit,
  Send,
  RotateCcw,
  Shield,
  Sparkles,
  Zap,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/ai")({
  component: PoliceAIPage,
});

const QUICK_PROMPTS = [
  { label: "Summarize critical cases",      prompt: "Summarize the most critical open cases" },
  { label: "Detect incident patterns",      prompt: "What patterns do you see in recent incidents?" },
  { label: "Theft investigation checklist", prompt: "Generate investigation checklist for a theft case" },
  { label: "Next actions for open cases",   prompt: "Suggest next actions for unresolved cases" },
  { label: "Translate Luganda statement",   prompt: "Translate a Luganda witness statement to English" },
  { label: "Robbery evidence guide",        prompt: "What evidence is typically needed for a robbery case?" },
  { label: "Draft missing person alert",    prompt: "Draft a community alert for a missing person" },
  { label: "Officer allocation advice",     prompt: "Recommend officer allocation for high-priority zones" },
];

const SYSTEM_PROMPT = `You are an expert AI Police Assistant embedded in the Allma Safety AI Command Center for the Uganda Police Force.

You help officers:
- Summarize and analyze incident reports
- Generate investigation notes and checklists
- Suggest next actions for open cases
- Detect patterns across multiple reports
- Draft official communications and alerts
- Translate statements (Luganda, Swahili, etc.)
- Recommend evidence collection steps
- Identify potential false reports
- Suggest officer assignments based on case type and location

Always be professional, precise, and concise. Prioritize officer safety and legal compliance. Reference Uganda Police Force procedures where relevant.`;

function AIAvatar({ size = "md" }: { size?: "sm" | "md" }) {
  const s = size === "sm" ? "h-8 w-8 rounded-xl" : "h-11 w-11 rounded-2xl";
  return (
    <div
      className={cn("grid shrink-0 place-items-center", s)}
      style={{
        background: "linear-gradient(135deg, oklch(0.575 0.235 26), oklch(0.855 0.175 88 / 0.9))",
        boxShadow: "0 0 20px oklch(0.575 0.235 26 / 0.4), 0 4px 12px oklch(0 0 0 / 0.25)",
      }}
    >
      <BrainCircuit className={size === "sm" ? "h-4 w-4 text-white" : "h-5 w-5 text-white"} />
    </div>
  );
}

function PoliceAIPage() {
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showQuick, setShowQuick] = useState(true);
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);

  const WELCOME: UIMessage = {
    id: "welcome",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "Hello, Officer. I'm your AI Police Assistant.\n\nI can help you analyze cases, generate investigation notes, detect patterns, draft communications, and recommend next actions.\n\nWhat do you need assistance with today?",
      },
    ],
  };

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
            body: { ...body, messages, systemPrompt: SYSTEM_PROMPT, policeMode: true },
            headers,
          };
        },
      }),
    [],
  );

  const { messages, sendMessage, status, error, regenerate, setMessages } = useChat({
    id: "police-ai",
    messages: [WELCOME],
    transport,
  });

  const isLoading = status === "submitted" || status === "streaming";

  function send() {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    setShowQuick(false);
    void sendMessage({ role: "user", parts: [{ type: "text", text }] });
  }

  function messageText(msg: UIMessage) {
    return msg.parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("");
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] w-full max-w-3xl flex-col lg:h-[calc(100vh-5.5rem)]">

      {/* ── HERO HEADER ─────────────────────────────────────────────────── */}
      <div
        className="mb-4 flex items-center justify-between overflow-hidden rounded-2xl p-4"
        style={{
          background: "linear-gradient(135deg, oklch(0.575 0.235 26 / 0.12), oklch(0.855 0.175 88 / 0.06) 60%, color-mix(in oklab, var(--card) 80%, transparent))",
          border: "1px solid oklch(0.575 0.235 26 / 0.2)",
          boxShadow: "0 1px 2px oklch(0 0 0 / 0.06), 0 8px 24px -12px oklch(0.575 0.235 26 / 0.2)",
        }}
      >
        <div className="flex items-center gap-3.5">
          <AIAvatar size="md" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[15px] font-bold tracking-tight text-foreground">
                AI Police Assistant
              </h1>
              <span
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.16em]"
                style={{
                  background: "oklch(0.62 0.13 160 / 0.12)",
                  border: "1px solid oklch(0.62 0.13 160 / 0.3)",
                  color: "oklch(0.62 0.13 160)",
                }}
              >
                <span className="h-1 w-1 rounded-full" style={{ background: "oklch(0.62 0.13 160)" }} />
                Secure
              </span>
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3 text-gold" />
              Allma Intelligence · Audit-logged
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="rounded-xl border-border/50 text-xs gap-1.5 h-8 px-3 shrink-0"
          onClick={() => {
            setMessages([WELCOME]);
            setShowQuick(true);
            setInput("");
          }}
        >
          <RotateCcw className="h-3 w-3" /> New session
        </Button>
      </div>

      {/* ── MESSAGES ────────────────────────────────────────────────────── */}
      <div className="flex-1 space-y-4 overflow-y-auto py-1 pr-0.5">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}
            >
              {msg.role === "assistant" && <AIAvatar size="sm" />}

              <div
                className={cn(
                  "relative max-w-[84%] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed",
                  msg.role === "user"
                    ? "rounded-br-sm text-white"
                    : "chat-card rounded-bl-sm text-foreground",
                )}
                style={
                  msg.role === "user"
                    ? {
                        background: "linear-gradient(135deg, oklch(0.575 0.235 26), oklch(0.7 0.21 36))",
                        boxShadow: "0 4px 16px oklch(0.575 0.235 26 / 0.35)",
                      }
                    : {}
                }
              >
                <span className="whitespace-pre-wrap">{messageText(msg)}</span>
              </div>

              {msg.role === "user" && (
                <div
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-xl self-start"
                  style={{
                    background: "color-mix(in oklab, var(--secondary) 80%, transparent)",
                    border: "1px solid color-mix(in oklab, var(--border) 70%, transparent)",
                  }}
                >
                  <Shield className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Thinking indicator */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex gap-3 justify-start"
            >
              <AIAvatar size="sm" />
              <div className="chat-card rounded-bl-sm px-4 py-3.5">
                <span className="flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-2 w-2 rounded-full animate-bounce"
                      style={{
                        background: "oklch(0.575 0.235 26 / 0.7)",
                        animationDelay: `${i * 0.18}s`,
                      }}
                    />
                  ))}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-between rounded-2xl px-4 py-3 text-[13px]"
            style={{
              background: "oklch(0.55 0.22 22 / 0.07)",
              border: "1px solid oklch(0.55 0.22 22 / 0.25)",
              color: "oklch(0.55 0.22 22)",
            }}
          >
            <span>Error: {error.message}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void regenerate()}
              className="text-destructive hover:text-destructive h-7 px-2 text-xs"
            >
              Retry
            </Button>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── QUICK PROMPTS ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showQuick && messages.length <= 1 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mt-2 mb-3"
          >
            <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60">
              <Zap className="h-3 w-3 text-gold" />
              Quick prompts
            </p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_PROMPTS.map((p, i) => (
                <motion.button
                  key={p.prompt}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.25 }}
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setInput(p.prompt);
                    setShowQuick(false);
                    textareaRef.current?.focus();
                  }}
                  className="group flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-[12px] font-medium text-muted-foreground transition-all"
                  style={{
                    background: "color-mix(in oklab, var(--secondary) 50%, transparent)",
                    border: "1px solid color-mix(in oklab, var(--border) 60%, transparent)",
                  }}
                >
                  <span className="truncate">{p.label}</span>
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── COMPOSER INPUT ──────────────────────────────────────────────── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="mt-1"
      >
        {/* Outer spinning gradient shell — same pattern as citizen chat */}
        <div className={cn("composer-shell", focused && "composer-shell-focused")}>
          <div className="composer-surface flex items-end gap-2 px-4 py-3">
            <textarea
              ref={textareaRef}
              value={input}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Ask about a case, request analysis, draft a communication…"
              className="min-h-[40px] flex-1 resize-none bg-transparent text-[13.5px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              style={{ maxHeight: "128px" }}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-all"
              style={
                input.trim() && !isLoading
                  ? {
                      background: "linear-gradient(135deg, oklch(0.575 0.235 26), oklch(0.7 0.21 36))",
                      boxShadow: "0 4px 16px oklch(0.575 0.235 26 / 0.45)",
                      color: "white",
                    }
                  : {
                      background: "color-mix(in oklab, var(--muted) 60%, transparent)",
                      color: "color-mix(in oklab, var(--muted-foreground) 40%, transparent)",
                      cursor: "not-allowed",
                    }
              }
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>

        <p className="mt-2 text-center text-[10.5px] text-muted-foreground/40">
          Secure officer session · All queries are audit-logged
        </p>
      </form>
    </div>
  );
}
