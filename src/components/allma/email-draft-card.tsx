import { useLayoutEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Mail, Send } from "lucide-react";
import { getEmailConnectionStatus, sendEmailFromMyAccount } from "@/lib/email-connection.functions";
import { hasPlaceholders, splitPlaceholders } from "@/lib/email-placeholders";
import { beginGmailConnect, sendErrorMessage } from "@/lib/gmail-client";

export type EmailDraft = {
  to?: string | null;
  recipient_name?: string | null;
  subject?: string;
  body?: string;
  placeholders?: string[];
};

const EMAIL_RE = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]+$/;

function stashKey(draft: EmailDraft) {
  return `allma-email-draft:${draft.subject ?? ""}:${(draft.body ?? "").length}`;
}

function readStash(draft: EmailDraft): { to: string; subject: string; body: string } | null {
  try {
    const raw = window.sessionStorage.getItem(stashKey(draft));
    return raw ? (JSON.parse(raw) as { to: string; subject: string; body: string }) : null;
  } catch {
    return null;
  }
}

const fieldClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary disabled:opacity-70";

/**
 * A text field that paints any [bracketed placeholder] with a highlight. The highlight layer sits
 * behind a transparent, auto-growing textarea so both always line up exactly.
 */
function HighlightField({
  value,
  onChange,
  disabled,
  singleLine,
  minRows,
  maxLength,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  singleLine?: boolean;
  minRows: number;
  maxLength: number;
  label: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  const flagged = hasPlaceholders(value);
  const layer = `${fieldClass.replace("border-border", "")} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words border-transparent text-transparent`;
  return (
    <div
      className={`relative rounded-lg ${flagged ? "ring-2 ring-amber-400/80" : ""}`}
      data-placeholder-flagged={flagged ? "true" : undefined}
    >
      <div aria-hidden className={layer}>
        {splitPlaceholders(value).map((segment, index) =>
          segment.placeholder ? (
            <mark key={index} className="rounded-sm bg-amber-300/70 text-transparent dark:bg-amber-400/50">
              {segment.text}
            </mark>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
        {value.endsWith("\n") ? "\u200b" : null}
      </div>
      <textarea
        ref={ref}
        aria-label={label}
        value={value}
        rows={minRows}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(e) => onChange(singleLine ? e.target.value.replace(/\n/g, " ") : e.target.value)}
        onKeyDown={singleLine ? (e) => e.key === "Enter" && e.preventDefault() : undefined}
        className={`${fieldClass.replace("bg-background", "bg-transparent")} relative block resize-none overflow-hidden leading-relaxed`}
      />
    </div>
  );
}

export function EmailDraftCard({
  draft,
  onSent,
}: {
  draft: EmailDraft;
  onSent?: (text: string) => void;
}) {
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getEmailConnectionStatus);
  const send = useServerFn(sendEmailFromMyAccount);
  const status = useQuery({ queryKey: ["email-connection"], queryFn: () => fetchStatus() });

  const stash = typeof window === "undefined" ? null : readStash(draft);
  const [to, setTo] = useState(stash?.to ?? draft.to ?? "");
  const [subject, setSubject] = useState(stash?.subject ?? draft.subject ?? "");
  const [body, setBody] = useState(stash?.body ?? draft.body ?? "");
  const [phase, setPhase] = useState<"editing" | "sending" | "sent" | "cancelled">("editing");
  const [sentFrom, setSentFrom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const connected = Boolean(status.data?.connected);
  const toValid = EMAIL_RE.test(to.trim());
  const needsFilling = hasPlaceholders(subject, body);
  const canSend =
    connected && toValid && !needsFilling && subject.trim().length > 0 && body.trim().length > 0;

  async function connect() {
    setConnecting(true);
    try {
      window.sessionStorage.setItem(stashKey(draft), JSON.stringify({ to, subject, body }));
    } catch {
      // The draft simply reloads in its original form.
    }
    const message = await beginGmailConnect();
    if (message) {
      setError(message);
      setConnecting(false);
    }
  }

  async function submit() {
    if (!canSend || phase === "sending") return;
    setPhase("sending");
    setError(null);
    try {
      const result = await send({ data: { to: to.trim(), subject: subject.trim(), body: body.trim() } });
      if (result.success) {
        setSentFrom(result.from);
        setPhase("sent");
        try {
          window.sessionStorage.removeItem(stashKey(draft));
        } catch {
          // Nothing to clean up.
        }
        onSent?.(`Email sent from ${result.from} to ${result.to}`);
        return;
      }
      setError(sendErrorMessage(result.error));
      if (result.error === "reconnect_needed" || result.error === "gmail_not_connected") {
        await queryClient.invalidateQueries({ queryKey: ["email-connection"] });
      }
    } catch {
      setError(sendErrorMessage());
    }
    setPhase("editing");
  }

  if (phase === "cancelled") {
    return (
      <div className="chat-card w-full p-3.5 text-[13px] text-muted-foreground">
        Email draft cancelled. Nothing was sent.
      </div>
    );
  }

  const locked = phase === "sending" || phase === "sent";
  return (
    <div className="chat-card w-full space-y-3 p-4">
      <div className="flex items-start gap-2">
        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">Email draft</p>
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            {phase === "sent"
              ? `Sent from ${sentFrom ?? "your Gmail"}.`
              : "Nothing is sent until you tap Send. You can edit every field."}
          </p>
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-[11.5px] font-semibold text-muted-foreground">
          To{draft.recipient_name ? ` · ${draft.recipient_name}` : ""}
        </span>
        <input
          type="email"
          inputMode="email"
          autoComplete="off"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          disabled={locked}
          placeholder="Type the recipient's email address"
          className={fieldClass}
        />
        {!to.trim() ? (
          <span className="block text-[11px] text-amber-700 dark:text-amber-400">
            Allma does not guess email addresses. Enter the one you want to write to.
          </span>
        ) : !toValid ? (
          <span className="block text-[11px] text-destructive">Enter one valid email address.</span>
        ) : null}
      </label>

      <div className="block space-y-1">
        <span className="text-[11.5px] font-semibold text-muted-foreground">Subject</span>
        <HighlightField
          label="Subject"
          value={subject}
          onChange={setSubject}
          disabled={locked}
          singleLine
          minRows={1}
          maxLength={200}
        />
      </div>

      <div className="block space-y-1">
        <span className="text-[11.5px] font-semibold text-muted-foreground">Body</span>
        <HighlightField
          label="Body"
          value={body}
          onChange={setBody}
          disabled={locked}
          minRows={8}
          maxLength={8000}
        />
      </div>

      {needsFilling && phase !== "sent" ? (
        <p role="alert" className="text-[12px] font-semibold text-amber-700 dark:text-amber-400">
          Fill in the highlighted parts before sending.
        </p>
      ) : null}

      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}

      {phase === "sent" ? (
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-700 dark:text-emerald-400">
          <Check className="h-4 w-4" /> Email sent from {sentFrom} to {to.trim()}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {status.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : connected ? (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSend || phase === "sending"}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {phase === "sending" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {phase === "sending" ? "Sending…" : "Send from my Gmail"}
            </button>
          ) : status.data && !status.data.configured ? (
            <span className="text-[11.5px] text-muted-foreground">
              Gmail sign-in is not set up on this deployment yet.
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void connect()}
              disabled={connecting}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              Connect Gmail
            </button>
          )}
          <button
            type="button"
            onClick={() => setPhase("cancelled")}
            disabled={phase === "sending"}
            className="inline-flex min-h-10 items-center rounded-full border border-border px-4 text-[12.5px] font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
          {connected && status.data?.email ? (
            <span className="text-[11px] text-muted-foreground">From {status.data.email}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
