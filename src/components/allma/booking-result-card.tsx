import { createContext, useContext, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Hospital,
  Loader2,
  Mail,
  MessageCircleQuestion,
  Phone,
  Send,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { extractBookingEmail } from "@/lib/chat-intent";

export type BookingProcessStep = {
  label: string;
  screenshot_url?: string | null;
  status?: string;
};

/** Lets the card send the patient's answer as their next chat message. Null once the question is stale. */
export const BookingAnswerContext = createContext<((text: string) => void) | null>(null);

export type BookingResultCardProps = {
  hospital: string;
  summary: string;
  success?: boolean;
  status?: string;
  screenshotUrl?: string | null;
  screenshots?: string[];
  steps?: BookingProcessStep[];
  preferredTime?: string | null;
  clinicPhone?: string | null;
  clinicEmail?: string | null;
  paymentRequired?: boolean;
  running?: boolean;
  needsInput?: boolean;
  question?: string | null;
  className?: string;
};

type Tone = "running" | "ok" | "ask" | "phone" | "fail";

const TONE_STYLES: Record<Tone, { card: string; badge: string; pill: string }> = {
  running: {
    card: "border-primary/25 bg-gradient-to-br from-primary/[0.06] to-card",
    badge: "bg-primary/15 text-primary",
    pill: "bg-primary/10 text-primary",
  },
  ok: {
    card: "border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.06] to-card",
    badge: "bg-emerald-500/15 text-emerald-600",
    pill: "bg-emerald-500/10 text-emerald-700",
  },
  ask: {
    card: "border-primary/30 bg-gradient-to-br from-primary/[0.08] to-card",
    badge: "bg-primary/15 text-primary",
    pill: "bg-primary/10 text-primary",
  },
  phone: {
    card: "border-amber-500/30 bg-gradient-to-br from-amber-500/[0.07] to-card",
    badge: "bg-amber-500/15 text-amber-700",
    pill: "bg-amber-500/10 text-amber-700",
  },
  fail: {
    card: "border-destructive/25 bg-gradient-to-br from-destructive/[0.06] to-card",
    badge: "bg-destructive/15 text-destructive",
    pill: "bg-destructive/10 text-destructive",
  },
};

const EXPECTED_STEPS = 8;

function AnswerBox({ onAnswer, placeholder }: { onAnswer: (text: string) => void; placeholder: string }) {
  const [value, setValue] = useState("");
  const [sent, setSent] = useState(false);
  const submit = () => {
    const text = value.trim();
    if (!text || sent) return;
    setSent(true);
    onAnswer(text);
  };
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        disabled={sent}
        aria-label="Your answer"
        className="h-11 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={!value.trim() || sent}
        aria-label="Send answer"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-chat-accent text-chat-accent-foreground disabled:opacity-50"
      >
        {sent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </button>
    </form>
  );
}

/**
 * Compact booking card: one live line while the agent works, the question front and
 * centre when it needs the patient, and the step log tucked behind a toggle.
 */
export function BookingResultCard({
  hospital,
  summary,
  success = false,
  status,
  screenshotUrl,
  screenshots = [],
  steps = [],
  preferredTime,
  clinicPhone,
  clinicEmail,
  paymentRequired = false,
  running = false,
  needsInput = false,
  question,
  className,
}: BookingResultCardProps) {
  const answer = useContext(BookingAnswerContext);
  const [showDetails, setShowDetails] = useState(false);

  const asking = needsInput || status === "needs_input";
  const phoneBooking = status === "phone_booking" || status === "captcha_blocked";
  const ok = Boolean(success) && !paymentRequired && !running && !phoneBooking && !asking;
  const resolvedEmail = (clinicEmail || extractBookingEmail(summary) || "").trim() || null;
  const tone: Tone = asking ? "ask" : running ? "running" : ok ? "ok" : phoneBooking ? "phone" : "fail";
  const styles = TONE_STYLES[tone];

  const title = asking
    ? "I need one detail from you"
    : running
      ? "Booking in progress"
      : paymentRequired
        ? "Payment needed first"
        : phoneBooking
          ? "Call the clinic to finish"
          : ok
            ? "Appointment booked"
            : "Could not complete the booking";
  const pill = asking ? "Waiting for you" : running ? "Live" : ok ? "Confirmed" : phoneBooking ? "By phone" : "Needs attention";

  const gallery = [
    ...screenshots,
    ...(screenshotUrl && !screenshots.includes(screenshotUrl) ? [screenshotUrl] : []),
  ].filter(Boolean);
  const latestShot = gallery[gallery.length - 1] ?? null;

  const dedupedSteps = steps.reduce<BookingProcessStep[]>((acc, step) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.label === step.label) {
      acc[acc.length - 1] = step;
      return acc;
    }
    acc.push(step);
    return acc;
  }, []);
  const stepCount = dedupedSteps.length;
  const progress = running ? Math.min(92, Math.max(8, Math.round((stepCount / EXPECTED_STEPS) * 100))) : 100;
  const liveLine = dedupedSteps[stepCount - 1]?.label || summary;

  const questionText = (question || summary || "").replace(/::suggest\[[^\]]*\]/g, "").replace(/\*\*/g, "").trim();
  const isContactQuestion = /website or phone number/i.test(questionText);

  return (
    <div className={cn("chat-card w-full overflow-hidden border", styles.card, className)}>
      <div className="flex items-start gap-3 p-4 pb-3">
        <span className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full", styles.badge)}>
          {running ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : asking ? (
            <MessageCircleQuestion className="h-5 w-5" />
          ) : ok ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : phoneBooking ? (
            <Phone className="h-5 w-5" />
          ) : (
            <XCircle className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Hospital booking
            </p>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold", styles.pill)}>
              {pill}
            </span>
          </div>
          <p className="mt-0.5 text-[15px] font-semibold leading-snug text-foreground">{title}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-foreground/90">
            <Hospital className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{hospital}</span>
            {preferredTime ? <span className="shrink-0 text-muted-foreground">· {preferredTime}</span> : null}
          </p>
        </div>
      </div>

      <div className="space-y-3 px-4 pb-4">
        {running ? (
          <div className="space-y-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">{liveLine}</p>
            {latestShot ? (
              <a
                href={latestShot}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-xl border border-border/60 bg-muted/30"
              >
                <img
                  src={latestShot}
                  alt={`What the booking agent sees for ${hospital}`}
                  className="max-h-28 w-full object-cover object-top"
                  loading="lazy"
                />
              </a>
            ) : null}
          </div>
        ) : null}

        {asking ? (
          <div className="space-y-3">
            <p className="text-[14px] font-medium leading-snug text-foreground">
              {isContactQuestion
                ? `Do you have the website or phone number for ${hospital}?`
                : questionText}
            </p>
            {answer ? (
              <AnswerBox
                onAnswer={answer}
                placeholder={isContactQuestion ? "Website or phone number" : "Type your answer"}
              />
            ) : (
              <p className="text-[12px] text-muted-foreground">This question has been answered or replaced.</p>
            )}
          </div>
        ) : null}

        {!running && !asking ? (
          <p className="line-clamp-4 text-[13.5px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {summary}
          </p>
        ) : null}

        {!running && !asking && (clinicPhone || resolvedEmail) ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {clinicPhone ? (
              <a
                href={`tel:${clinicPhone.replace(/[^\d+]/g, "")}`}
                aria-label={`Call ${hospital} ${clinicPhone}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-chat-accent px-4 text-[13px] font-semibold text-chat-accent-foreground"
              >
                <Phone className="h-4 w-4" /> Call {clinicPhone}
              </a>
            ) : null}
            {resolvedEmail ? (
              <a
                href={`mailto:${resolvedEmail}?subject=${encodeURIComponent(`Appointment request — ${hospital}`)}&body=${encodeURIComponent(`Hello,\n\nI would like to book an appointment${preferredTime ? ` for ${preferredTime}` : ""}.\n\nThank you.`)}`}
                aria-label={`Email ${hospital} ${resolvedEmail}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-background px-4 text-[13px] font-semibold text-foreground"
              >
                <Mail className="h-4 w-4" /> Email clinic
              </a>
            ) : null}
          </div>
        ) : null}

        {stepCount > 0 || gallery.length > 1 ? (
          <div>
            <button
              type="button"
              onClick={() => setShowDetails((open) => !open)}
              aria-expanded={showDetails}
              className="flex min-h-9 w-full items-center justify-between rounded-lg px-1 text-[12px] font-semibold text-muted-foreground"
            >
              <span>
                {showDetails ? "Hide" : "Show"} what I did ({stepCount} {stepCount === 1 ? "step" : "steps"})
              </span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", showDetails && "rotate-180")} />
            </button>
            {showDetails ? (
              <div className="mt-1 space-y-3 rounded-xl border border-border/60 bg-background/60 p-3">
                <ol className="space-y-1.5">
                  {dedupedSteps.slice(-14).map((step, index, list) => {
                    const last = index === list.length - 1;
                    return (
                      <li key={`${index}-${step.label}`} className="flex items-start gap-2">
                        {running && last ? (
                          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                        ) : step.status === "failed" ? (
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                        ) : (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        )}
                        <span className="line-clamp-2 text-[12.5px] leading-snug text-foreground/85">
                          {step.label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                {gallery.length ? (
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {gallery.map((src, index) => (
                      <a
                        key={`${src}-${index}`}
                        href={src}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted/40"
                      >
                        <img
                          src={src}
                          alt={`Booking screenshot ${index + 1} for ${hospital}`}
                          className="h-full w-full object-cover object-top"
                          loading="lazy"
                        />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {tone === "fail" ? (
          <p className="text-[12px] text-muted-foreground">
            If this is a medical emergency, call Ambulance 911, Toll-free 112, or Police 999.
          </p>
        ) : null}
      </div>
    </div>
  );
}
