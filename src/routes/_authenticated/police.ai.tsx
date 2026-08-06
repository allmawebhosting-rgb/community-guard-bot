import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BrainCircuit,
  Send,
  RotateCcw,
  Sparkles,
  Shield,
  ChevronRight,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/ai")({
  component: PoliceAIPage,
});

const QUICK_PROMPTS = [
  { label: "Summarize critical cases",       prompt: "Summarize the most critical open cases" },
  { label: "Detect incident patterns",       prompt: "What patterns do you see in recent incidents?" },
  { label: "Theft investigation checklist",  prompt: "Generate investigation checklist for a theft case" },
  { label: "Next actions for open cases",    prompt: "Suggest next actions for unresolved cases" },
  { label: "Translate Luganda statement",    prompt: "Translate a Luganda witness statement to English" },
  { label: "Robbery evidence guide",         prompt: "What evidence is typically needed for a robbery case?" },
  { label: "Draft missing person alert",     prompt: "Draft a community alert for a missing person" },
  { label: "Officer allocation advice",      prompt: "Recommend officer allocation for high-priority zones" },
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

function PoliceAIPage() {
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showQuick, setShowQuick] = useState(true);
  const [input, setInput] = useState("");

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

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  function handleQuick(prompt: string) {
    setInput(prompt);
    setShowQuick(false);
    textareaRef.current?.focus();
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] w-full max-w-3xl flex-col lg:h-[calc(100vh-5.5rem)]">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* AI Avatar */}
          <div className="relative grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-primary via-primary to-gold shadow-lift">
            <BrainCircuit className="h-5 w-5 text-primary-foreground" />
            <span className="absolute -inset-px rounded-2xl border border-white/10" />
          </div>
          <div>
            <h1 className="font-display text-[15px] font-bold tracking-tight text-foreground">
              AI Police Assistant
            </h1>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3 text-gold" />
              Powered by Allma Intelligence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status pill */}
          <span className="hidden items-center gap-1.5 rounded-full border border-success/30 bg-success/[0.08] px-3 py-1.5 text-[10.5px] font-semibold text-success sm:inline-flex">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            Secure · Ready
          </span>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-border/50 text-xs gap-1.5 h-8 px-3"
            onClick={() => {
              setMessages([WELCOME]);
              setShowQuick(true);
              setInput("");
            }}
          >
            <RotateCcw className="h-3 w-3" /> New session
          </Button>
        </div>
      </div>

      {/* ── Intelligence brief banner (shown only at start) ───────────── */}
      <AnimatePresence>
        {showQuick && messages.length <= 1 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mb-4 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-card to-gold/[0.05] p-4 shadow-soft"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-xl border border-primary/25 bg-background/60 backdrop-blur">
                <Shield className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/80">
                Allma Intelligence Brief
              </p>
            </div>
            <p className="mb-1 font-display text-sm font-semibold text-foreground">
              Select a quick prompt or describe your request
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              I can analyze cases, draft alerts, detect patterns, and recommend next actions — all within police protocol.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Messages ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-0.5 py-1">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: i === 0 ? 0 : 0 }}
              className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}
            >
              {/* AI avatar */}
              {msg.role === "assistant" && (
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-gold text-[10px] font-black text-white shadow-soft mt-0.5 self-start">
                  <BrainCircuit className="h-3.5 w-3.5" />
                </div>
              )}

              <div
                className={cn(
                  "relative max-w-[84%] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed",
                  msg.role === "user"
                    ? "rounded-br-sm bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-lift"
                    : "rounded-bl-sm border border-border/40 bg-card shadow-soft text-foreground",
                )}
              >
                {/* Subtle glow for user messages */}
                {msg.role === "user" && (
                  <span className="pointer-events-none absolute inset-0 rounded-2xl rounded-br-sm border border-white/10" />
                )}
                <span className="whitespace-pre-wrap">{messageText(msg)}</span>
              </div>

              {/* User avatar */}
              {msg.role === "user" && (
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary/30 to-gold/30 text-[10px] font-bold text-foreground border border-border/40 mt-0.5 self-start">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Streaming / loading indicator */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.25 }}
              className="flex gap-3 justify-start"
            >
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-gold shadow-soft">
                <BrainCircuit className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="rounded-2xl rounded-bl-sm border border-border/40 bg-card px-4 py-3.5 shadow-soft">
                <span className="flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce"
                      style={{ animationDelay: `${i * 0.18}s` }}
                    />
                  ))}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-between rounded-2xl border border-destructive/30 bg-destructive/[0.07] px-4 py-3 text-[13px] text-destructive"
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

      {/* ── Quick prompts ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showQuick && messages.length <= 1 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mb-3 mt-2"
          >
            <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
              <Zap className="h-3 w-3 text-gold" />
              Quick prompts
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
              {QUICK_PROMPTS.map((p, i) => (
                <motion.button
                  key={p.prompt}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleQuick(p.prompt)}
                  className="group flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-secondary/30 px-3.5 py-2.5 text-left text-[12px] font-medium text-muted-foreground transition-all hover:border-primary/35 hover:bg-primary/[0.06] hover:text-foreground"
                >
                  <span className="truncate">{p.label}</span>
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5 group-hover:text-primary/60" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Input ─────────────────────────────────────────────────────── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="mt-1"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-border/50 bg-card/80 p-2 shadow-soft backdrop-blur-sm transition-colors focus-within:border-primary/40 focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Ask about a case, request analysis, draft communications…"
            className="min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[13.5px] placeholder:text-muted-foreground/50 focus:outline-none"
            style={{ maxHeight: "128px" }}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-all",
              input.trim() && !isLoading
                ? "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-lift hover:opacity-90 hover:-translate-y-0.5"
                : "bg-secondary text-muted-foreground/40 cursor-not-allowed",
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10.5px] text-muted-foreground/50">
          Secure officer session · All queries are audit-logged
        </p>
      </form>
    </div>
  );
}
