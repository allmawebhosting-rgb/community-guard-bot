import { useMemo, useState } from "react";
import {
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck2,
  FileQuestion,
  GitBranch,
  MessageSquareText,
  Paperclip,
  Send,
  ShieldAlert,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { evidenceQuery, timeAgo, type Dispatch, type Evidence, type Incident } from "@/lib/police";
import { cn } from "@/lib/utils";

type TimelineEvent = {
  time: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
};

type Fact = {
  text: string;
  source: "Confirmed" | "Reported" | "Unconfirmed" | "AI inference" | "Missing";
};

const FACT_META: Record<Fact["source"], { tone: string; dot: string }> = {
  Confirmed: { tone: "border-success/25 bg-success/[0.07] text-success", dot: "bg-success" },
  Reported: { tone: "border-primary/25 bg-primary/[0.07] text-primary", dot: "bg-primary" },
  Unconfirmed: { tone: "border-alert/25 bg-alert/[0.07] text-alert", dot: "bg-alert" },
  "AI inference": { tone: "border-gold/25 bg-gold/[0.07] text-gold", dot: "bg-gold" },
  Missing: {
    tone: "border-border/60 bg-secondary/30 text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
};

const COPILOT_PROMPTS = [
  "What do we know?",
  "What is still unknown?",
  "Summarize the timeline",
  "What should I verify?",
  "Summarize the community context and available evidence",
  "Prepare a handover brief",
];

function factsForCase(incident: Incident, evidence: Evidence[], dispatches: Dispatch[]) {
  const confirmed: Fact[] = [];
  const reported: Fact[] = [];
  const unconfirmed: Fact[] = [];
  const inferred: Fact[] = [];
  const missing: Fact[] = [];

  if (incident.location_text || incident.latitude !== null) {
    confirmed.push({
      text: `Location received${incident.location_text ? `: ${incident.location_text}` : ""}.`,
      source: "Confirmed",
    });
  } else {
    missing.push({ text: "Exact incident location", source: "Missing" });
  }

  if (incident.created_at) {
    confirmed.push({
      text: `Case created ${new Date(incident.created_at).toLocaleString("en-UG", { dateStyle: "medium", timeStyle: "short" })}.`,
      source: "Confirmed",
    });
  }

  if (incident.narrative || incident.summary) {
    reported.push({
      text: incident.narrative ?? incident.summary ?? "Citizen statement is available.",
      source: "Reported",
    });
  } else {
    missing.push({ text: "Citizen statement", source: "Missing" });
  }

  if (incident.category) {
    inferred.push({
      text: `Possible ${incident.category.replace(/_/g, " ")} case based on the submitted category.`,
      source: "AI inference",
    });
  } else {
    missing.push({ text: "Incident type", source: "Missing" });
  }

  if (incident.occurred_at) {
    reported.push({
      text: `Reported incident time: ${new Date(incident.occurred_at).toLocaleString("en-UG", { dateStyle: "medium", timeStyle: "short" })}.`,
      source: "Reported",
    });
  } else {
    missing.push({ text: "Exact incident time", source: "Missing" });
  }

  if (evidence.length > 0) {
    confirmed.push({
      text: `${evidence.length} submitted evidence file${evidence.length === 1 ? "" : "s"} are available in the evidence locker.`,
      source: "Confirmed",
    });
  } else {
    missing.push({ text: "Submitted media or documents", source: "Missing" });
  }

  if (dispatches.length > 0) {
    confirmed.push({
      text: `${dispatches.length} officer dispatch record${dispatches.length === 1 ? "" : "s"} logged.`,
      source: "Confirmed",
    });
  } else {
    unconfirmed.push({
      text: "No officer assignment is recorded in this case view.",
      source: "Unconfirmed",
    });
  }

  missing.push({ text: "Witness information", source: "Missing" });
  unconfirmed.push({ text: "Current danger status requires confirmation.", source: "Unconfirmed" });

  return { confirmed, reported, unconfirmed, inferred, missing };
}

function answerForPrompt(
  prompt: string,
  facts: ReturnType<typeof factsForCase>,
  timeline: TimelineEvent[],
  evidence: Evidence[],
  incident: Incident,
) {
  const lower = prompt.toLowerCase();
  if (lower.includes("unknown") || lower.includes("verify")) {
    return {
      title: "Verification queue",
      body: facts.missing.length
        ? facts.missing.map((item) => item.text).join(" ")
        : "No missing fields are visible in this case view.",
      next: "Confirm each item with the citizen or an authorized officer before treating it as established.",
    };
  }
  if (lower.includes("timeline") || lower.includes("changed")) {
    return {
      title: "Case timeline",
      body: timeline.length
        ? timeline
            .map(
              (event) =>
                `${new Date(event.time).toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" })} — ${event.label}`,
            )
            .join("\n")
        : "No system events are available in this case view.",
      next: "Review the latest system event and record any officer action separately.",
    };
  }
  if (lower.includes("evidence")) {
    return {
      title: "Evidence received",
      body: evidence.length
        ? evidence
            .map((item) => item.caption ?? item.storage_path.split("/").pop() ?? "Evidence file")
            .join(", ")
        : "No evidence files are attached to this case.",
      next: evidence.length
        ? "Open the evidence locker to review each file and preserve the access trail."
        : "Request additional evidence only if it is safe and relevant.",
    };
  }
  if (lower.includes("handover")) {
    return {
      title: "Editable handover brief",
      body: `${incident.reference} · ${incident.title}\n${incident.priority.toUpperCase()} priority · ${incident.location_text ?? "Location not provided"}\n${incident.summary ?? incident.narrative ?? "Citizen statement not provided."}`,
      next: "Edit this brief with official actions and send it only through an authorized workflow.",
    };
  }
  if (lower.includes("related") || lower.includes("connection")) {
    return {
      title: "Possible connections",
      body: "No related-case search was run from this case view.",
      next: "Use authorized case search to compare location, category and timing. A possible connection is not a confirmed connection.",
    };
  }
  return {
    title: "Case brief",
    body: `${facts.reported[0]?.text ?? "The citizen statement is not provided."}\n\n${facts.confirmed.map((item) => item.text).join(" ")}`,
    next: facts.missing.length
      ? `Next action: verify ${facts.missing[0].text.toLowerCase()}.`
      : "Next action: continue the authorized investigation workflow.",
  };
}

function FactGroup({ title, facts }: { title: string; facts: Fact[] }) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/25 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </p>
        <span className="text-[10px] tabular-nums text-muted-foreground">{facts.length}</span>
      </div>
      <div className="space-y-2">
        {facts.slice(0, 3).map((fact, index) => {
          const meta = FACT_META[fact.source];
          return (
            <div key={`${fact.text}-${index}`} className="flex gap-2 text-[11px] leading-relaxed">
              <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} />
              <div className="min-w-0">
                <p className="text-foreground/90">{fact.text}</p>
                <span
                  className={cn(
                    "mt-1 inline-flex rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                    meta.tone,
                  )}
                >
                  {fact.source}
                </span>
              </div>
            </div>
          );
        })}
        {facts.length > 3 && (
          <p className="text-[10px] text-muted-foreground">+{facts.length - 3} more items</p>
        )}
      </div>
    </div>
  );
}

export function CaseIntelligencePanel({
  incident,
  dispatches,
  timeline,
}: {
  incident: Incident;
  dispatches: Dispatch[];
  timeline: TimelineEvent[];
}) {
  const { data: evidence = [] } = useQuery(evidenceQuery(incident.id));
  const [expanded, setExpanded] = useState(true);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [input, setInput] = useState("");
  const [lastPrompt, setLastPrompt] = useState(COPILOT_PROMPTS[0]);

  const facts = useMemo(
    () => factsForCase(incident, evidence, dispatches),
    [incident, evidence, dispatches],
  );
  const completenessItems = [
    { label: "Location", done: Boolean(incident.location_text || incident.latitude !== null) },
    { label: "Incident type", done: Boolean(incident.category) },
    { label: "Citizen statement", done: Boolean(incident.narrative || incident.summary) },
    { label: "Timeline", done: Boolean(incident.occurred_at || timeline.length > 0) },
    { label: "Evidence", done: evidence.length > 0 },
    { label: "Officer response", done: dispatches.length > 0 },
  ];
  const completeness = Math.round(
    (completenessItems.filter((item) => item.done).length / completenessItems.length) * 100,
  );
  const health =
    incident.priority === "critical" && !dispatches.length
      ? { label: "Critical unresolved", tone: "text-primary", dot: "bg-primary" }
      : facts.missing.length >= 3
        ? { label: "Missing information", tone: "text-gold", dot: "bg-gold" }
        : { label: "Requires review", tone: "text-alert", dot: "bg-alert" };
  const answer = answerForPrompt(lastPrompt, facts, timeline, evidence, incident);

  function ask(prompt: string) {
    const next = prompt.trim();
    if (!next) return;
    setLastPrompt(next);
    setInput("");
    setCopilotOpen(true);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-primary/25 bg-[radial-gradient(circle_at_90%_0%,hsl(var(--gold)/.13),transparent_25%),linear-gradient(135deg,hsl(var(--primary)/.08),hsl(var(--card)/.98)_58%)] shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/30 px-4 py-3.5 lg:px-5">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary">
            <BrainCircuit className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-display text-sm font-bold">AI Case Intelligence</p>
              <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
                Demo intelligence
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Case-scoped assistance · human decisions remain authoritative
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCopilotOpen((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary transition hover:bg-primary/15"
          >
            <MessageSquareText className="h-3.5 w-3.5" /> Ask Allma
          </button>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? "Collapse intelligence" : "Expand intelligence"}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-secondary/60 hover:text-foreground"
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", !expanded && "-rotate-90")}
            />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 p-4 lg:p-5">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border/40 bg-background/25 p-3">
              <div className="flex items-center justify-between">
                <p className="label-xs">Case health</p>
                <span className={cn("h-2 w-2 rounded-full", health.dot)} />
              </div>
              <p className={cn("mt-2 text-sm font-semibold", health.tone)}>{health.label}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Documentation signal, not a truth score
              </p>
            </div>
            <div className="rounded-xl border border-border/40 bg-background/25 p-3">
              <div className="flex items-center justify-between">
                <p className="label-xs">Completeness</p>
                <span className="text-sm font-bold text-foreground">{completeness}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${completeness}%` }}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Based on visible case fields
              </p>
            </div>
            <div className="rounded-xl border border-border/40 bg-background/25 p-3">
              <p className="label-xs">Open questions</p>
              <p className="mt-2 text-sm font-semibold">{facts.missing.length}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Require citizen or officer verification
              </p>
            </div>
            <div className="rounded-xl border border-border/40 bg-background/25 p-3">
              <p className="label-xs">Evidence</p>
              <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
                <Paperclip className="h-3.5 w-3.5 text-gold" />
                {evidence.length} file{evidence.length === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Access remains logged in the evidence locker
              </p>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[1fr_1fr_1fr]">
            <FactGroup title="Confirmed" facts={facts.confirmed} />
            <FactGroup title="Reported / inferred" facts={[...facts.reported, ...facts.inferred]} />
            <FactGroup
              title="Unknown / requires review"
              facts={[...facts.unconfirmed, ...facts.missing]}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
            <div className="rounded-xl border border-border/40 bg-background/25 p-3.5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-3.5 w-3.5 text-primary" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Intelligence timeline
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground">System events only</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {timeline.slice(-6).map((event, index) => {
                  const Icon = event.icon;
                  return (
                    <div
                      key={`${event.time}-${index}`}
                      className="flex gap-2.5 rounded-lg border border-border/30 bg-secondary/20 p-2.5"
                    >
                      <div
                        className={cn(
                          "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-secondary/70",
                          event.color,
                        )}
                      >
                        <Icon className="h-3 w-3" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium">{event.label}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock3 className="h-2.5 w-2.5" />
                          {timeAgo(event.time)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {timeline.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    No system events are available.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gold/25 bg-gold/[0.05] p-3.5">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-gold" />
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold">
                  Recommended next step
                </p>
              </div>
              <p className="text-[12px] leading-relaxed">
                {facts.missing.length
                  ? `Verify ${facts.missing[0].text.toLowerCase()} before progressing the case.`
                  : "Continue the authorized investigation workflow and document each action."}
              </p>
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-gold/15 bg-background/20 p-2.5 text-[10px] leading-relaxed text-muted-foreground">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" /> AI recommendations
                support officers; they do not accuse, determine guilt, or trigger official action.
              </div>
            </div>
          </div>

          {copilotOpen && (
            <div className="rounded-xl border border-primary/25 bg-background/45 p-3.5 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary">
                    <BrainCircuit className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold">Ask Allma about this case</p>
                    <p className="text-[10px] text-muted-foreground">
                      Answers use only the currently authorized case view.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCopilotOpen(false)}
                  aria-label="Close Ask Allma"
                  className="rounded-md p-1 text-muted-foreground hover:bg-secondary/60"
                >
                  <ChevronDown className="h-3.5 w-3.5 rotate-180" />
                </button>
              </div>
              <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
                {COPILOT_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => ask(prompt)}
                    className={cn(
                      "shrink-0 rounded-lg border px-2.5 py-1.5 text-[10px] transition",
                      prompt === lastPrompt
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/40 bg-secondary/30 text-muted-foreground hover:border-border hover:text-foreground",
                    )}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]">
                <div className="rounded-lg border border-border/35 bg-card/60 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Answer · AI generated
                    </p>
                  </div>
                  <p className="whitespace-pre-line text-[12px] leading-relaxed">{answer.body}</p>
                  <div className="mt-3 border-t border-border/30 pt-2.5 text-[10px] leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground/80">Next action:</span>{" "}
                    {answer.next}
                  </div>
                </div>
                <div className="rounded-lg border border-border/35 bg-secondary/20 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {answer.title}
                  </p>
                  <div className="mt-2 space-y-2 text-[10px] text-muted-foreground">
                    <p className="flex gap-1.5">
                      <FileCheck2 className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                      Source: current case record
                    </p>
                    <p className="flex gap-1.5">
                      <FileQuestion className="mt-0.5 h-3 w-3 shrink-0 text-gold" />
                      Confidence: contextual, not independently verified
                    </p>
                    <p className="flex gap-1.5">
                      <UserRound className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                      Human review required
                    </p>
                  </div>
                </div>
              </div>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  ask(input);
                }}
              >
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask a case-scoped question…"
                  className="min-w-0 flex-1 rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-[11px] outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/50"
                />
                <button
                  type="submit"
                  aria-label="Ask question"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition hover:bg-primary/90"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
