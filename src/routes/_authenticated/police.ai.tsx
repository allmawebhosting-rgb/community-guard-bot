import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState } from "react";
import { Brain, Send, RotateCcw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/ai")({
  component: PoliceAIPage,
});

const QUICK_PROMPTS = [
  "Summarize the most critical open cases",
  "What patterns do you see in recent incidents?",
  "Generate investigation checklist for a theft case",
  "Suggest next actions for unresolved cases",
  "Translate a Luganda witness statement to English",
  "What evidence is typically needed for a robbery case?",
  "Draft a community alert for a missing person",
  "Recommend officer allocation for high-priority zones",
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
  const [showQuick, setShowQuick] = useState(true);

  const { messages, input, setInput, handleSubmit, isLoading, error, reload, setMessages } = useChat({
    api: "/api/chat",
    body: { systemPrompt: SYSTEM_PROMPT, policeMode: true },
    initialMessages: [
      {
        id: "welcome",
        role: "assistant",
        content: "Hello, Officer. I'm your AI Police Assistant.\n\nI can help you analyze cases, generate investigation notes, detect patterns, draft communications, and recommend next actions.\n\nWhat do you need assistance with today?",
      },
    ],
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleQuick(prompt: string) {
    setInput(prompt);
    setShowQuick(false);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] w-full max-w-4xl flex-col gap-0 lg:h-[calc(100vh-5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-4 mb-2">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-primary to-gold shadow-lift">
            <Brain className="h-4.5 w-4.5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-sm font-semibold">AI Police Assistant</h1>
            <p className="text-[11px] text-muted-foreground">Powered by OpenAI GPT-4o</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-3 py-1 text-[11px] font-medium text-success sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Ready
          </span>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full text-xs gap-1.5"
            onClick={() => {
              setMessages([{
                id: "welcome",
                role: "assistant",
                content: "Hello, Officer. I'm your AI Police Assistant.\n\nI can help you analyze cases, generate investigation notes, detect patterns, draft communications, and recommend next actions.\n\nWhat do you need assistance with today?",
              }]);
              setShowQuick(true);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> New session
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}
          >
            {msg.role === "assistant" && (
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-gold text-[10px] font-bold text-primary-foreground mt-0.5">
                AI
              </div>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "premium-surface border border-border/50 shadow-soft rounded-bl-sm",
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-gold text-[10px] font-bold text-primary-foreground">
              AI
            </div>
            <div className="premium-surface rounded-2xl rounded-bl-sm border border-border/50 px-4 py-3">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-between rounded-2xl border border-alert/30 bg-alert/10 px-4 py-3 text-sm text-alert">
            <span>Error: {error.message}</span>
            <Button variant="ghost" size="sm" onClick={() => reload()} className="text-alert hover:text-alert">Retry</Button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      {showQuick && messages.length <= 1 && (
        <div className="mb-3">
          <button
            onClick={() => setShowQuick(false)}
            className="mb-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className="h-3 w-3" /> Quick prompts
          </button>
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => handleQuick(p)}
                className="rounded-full border border-border/50 bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:bg-primary/8 hover:text-foreground"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-border/40 pt-3">
        <div className="relative flex-1">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as unknown as React.FormEvent);
              }
            }}
            rows={1}
            placeholder="Ask about a case, request analysis, draft communications…"
            className="w-full resize-none rounded-2xl border border-border/60 bg-secondary/30 px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 max-h-32"
            style={{ minHeight: "44px" }}
          />
        </div>
        <Button
          type="submit"
          disabled={isLoading || !input.trim()}
          size="icon"
          className="h-11 w-11 shrink-0 rounded-2xl"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
