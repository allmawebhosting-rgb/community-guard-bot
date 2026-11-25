import { CheckCircle2, Circle, Hospital, Loader2, Phone, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type BookingProcessStep = {
  label: string;
  screenshot_url?: string | null;
  status?: string;
};

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
  paymentRequired?: boolean;
  running?: boolean;
  className?: string;
};

/**
 * Shows the VPS browser-agent booking outcome: live process steps,
 * screenshot gallery, and Uganda emergency call fallbacks on failure.
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
  paymentRequired = false,
  running = false,
  className,
}: BookingResultCardProps) {
  const phoneBooking = status === "phone_booking" || status === "captcha_blocked";
  const ok = Boolean(success) && !paymentRequired && !running && !phoneBooking;
  const title = running
    ? "Booking in progress…"
    : paymentRequired
      ? "Payment required — booking paused"
      : phoneBooking
        ? "Call the clinic to finish booking"
        : ok
          ? "Appointment booking confirmed"
          : "Appointment booking needs attention";

  const gallery = [
    ...screenshots,
    ...(screenshotUrl && !screenshots.includes(screenshotUrl) ? [screenshotUrl] : []),
  ].filter(Boolean);

  // Collapse repeated CAPTCHA / identical labels so the card stays readable.
  const dedupedSteps = steps.reduce<BookingProcessStep[]>((acc, step) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.label === step.label) {
      acc[acc.length - 1] = { ...step, screenshot_url: step.screenshot_url || prev.screenshot_url };
      return acc;
    }
    acc.push(step);
    return acc;
  }, []);
  const process = dedupedSteps.length
    ? dedupedSteps.slice(-12)
    : running
      ? [
          { label: "Starting browser agent…", status: "running" },
          { label: "Opening clinic website…", status: "pending" },
          { label: "Filling appointment form…", status: "pending" },
          { label: "Capturing confirmation…", status: "pending" },
        ]
      : [];

  return (
    <div
      className={cn(
        "chat-card w-full overflow-hidden border",
        running
          ? "border-primary/25 bg-gradient-to-br from-primary/[0.06] to-card"
          : ok
            ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.06] to-card"
            : phoneBooking
              ? "border-amber-500/30 bg-gradient-to-br from-amber-500/[0.07] to-card"
              : "border-destructive/25 bg-gradient-to-br from-destructive/[0.06] to-card",
        className,
      )}
    >
      <div className="flex items-start gap-3 p-4 pb-3">
        <span
          className={cn(
            "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full",
            running
              ? "bg-primary/15 text-primary"
              : ok
                ? "bg-emerald-500/15 text-emerald-600"
                : phoneBooking
                  ? "bg-amber-500/15 text-amber-700"
                  : "bg-destructive/15 text-destructive",
          )}
        >
          {running ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : ok ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : phoneBooking ? (
            <Phone className="h-5 w-5" />
          ) : (
            <XCircle className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {status === "payment_required"
              ? "Payment gate"
              : phoneBooking
                ? "Phone booking"
                : "Hospital booking"}
          </p>
          <p className="mt-0.5 text-[15px] font-semibold leading-snug text-foreground">{title}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-foreground/90">
            <Hospital className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{hospital}</span>
          </p>
          {preferredTime ? (
            <p className="mt-0.5 text-[12px] text-muted-foreground">Preferred: {preferredTime}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 px-4 pb-4">
        {process.length ? (
          <div className="space-y-2 rounded-xl border border-border/60 bg-background/60 p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Booking process
            </p>
            <ol className="space-y-2">
              {process.map((step, index) => {
                const isLast = index === process.length - 1;
                const done =
                  !running ||
                  index < process.length - 1 ||
                  step.status === "completed" ||
                  step.status === "failed" ||
                  step.status === "payment_required";
                return (
                  <li key={`${index}-${step.label}`} className="flex items-start gap-2.5">
                    <span className="mt-0.5 shrink-0 text-muted-foreground">
                      {running && isLast ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      ) : done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Circle className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-[12.5px] leading-snug",
                          running && isLast ? "font-semibold text-foreground" : "text-foreground/85",
                        )}
                      >
                        {step.label}
                      </p>
                      {step.screenshot_url ? (
                        <a
                          href={step.screenshot_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 block overflow-hidden rounded-lg border border-border/50 bg-muted/30"
                        >
                          <img
                            src={step.screenshot_url}
                            alt={step.label}
                            className="max-h-36 w-full object-contain object-top"
                            loading="lazy"
                          />
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}

        <p className="text-[13.5px] leading-relaxed text-foreground/90 whitespace-pre-wrap">{summary}</p>

        {gallery.length ? (
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Screenshots
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {gallery.map((src, index) => (
                <a
                  key={`${src}-${index}`}
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-xl border border-border/60 bg-muted/40"
                >
                  <img
                    src={src}
                    alt={`Booking screenshot ${index + 1} for ${hospital}`}
                    className="max-h-52 w-full object-contain object-top"
                    loading="lazy"
                  />
                  <p className="border-t border-border/50 px-3 py-1.5 text-center text-[11px] font-medium text-muted-foreground">
                    Tap to open · {index + 1}/{gallery.length}
                  </p>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {clinicPhone && !running ? (
          <a
            href={`tel:${clinicPhone.replace(/[^\d+]/g, "")}`}
            aria-label={`Call ${hospital} ${clinicPhone}`}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-chat-accent px-4 text-[13px] font-semibold text-chat-accent-foreground"
          >
            <Phone className="h-4 w-4" /> Call {clinicPhone}
          </a>
        ) : null}

        {!ok && !running ? (
          <div className="space-y-2">
            <p className="text-[12px] font-semibold text-muted-foreground">
              If this is urgent, call emergency services now:
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <a
                href="tel:999"
                aria-label="Call Police 999"
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-3 text-[12px] font-semibold text-foreground"
              >
                <Phone className="h-3.5 w-3.5" /> Police 999
              </a>
              <a
                href="tel:911"
                aria-label="Call Ambulance 911"
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/[0.06] px-3 text-[12px] font-semibold text-destructive"
              >
                <Phone className="h-3.5 w-3.5" /> Ambulance 911
              </a>
              <a
                href="tel:112"
                aria-label="Call Toll-free 112"
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-chat-accent px-3 text-[12px] font-semibold text-chat-accent-foreground"
              >
                <Phone className="h-3.5 w-3.5" /> Toll-free 112
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
