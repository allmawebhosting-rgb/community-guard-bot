import { CheckCircle2, Hospital, Phone, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type BookingResultCardProps = {
  hospital: string;
  summary: string;
  success?: boolean;
  status?: string;
  screenshotUrl?: string | null;
  preferredTime?: string | null;
  paymentRequired?: boolean;
  className?: string;
};

/**
 * Shows the VPS browser-agent booking outcome: confirmation summary,
 * screenshot preview, and Uganda emergency call fallbacks on failure.
 */
export function BookingResultCard({
  hospital,
  summary,
  success = false,
  status,
  screenshotUrl,
  preferredTime,
  paymentRequired = false,
  className,
}: BookingResultCardProps) {
  const ok = Boolean(success) && !paymentRequired;
  const title = paymentRequired
    ? "Payment required — booking paused"
    : ok
      ? "Appointment booking confirmed"
      : "Appointment booking needs attention";

  return (
    <div
      className={cn(
        "chat-card w-full overflow-hidden border",
        ok
          ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.06] to-card"
          : "border-destructive/25 bg-gradient-to-br from-destructive/[0.06] to-card",
        className,
      )}
    >
      <div className="flex items-start gap-3 p-4 pb-3">
        <span
          className={cn(
            "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full",
            ok ? "bg-emerald-500/15 text-emerald-600" : "bg-destructive/15 text-destructive",
          )}
        >
          {ok ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {status === "payment_required" ? "Payment gate" : "Hospital booking"}
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
        <p className="text-[13.5px] leading-relaxed text-foreground/90 whitespace-pre-wrap">{summary}</p>

        {screenshotUrl ? (
          <a
            href={screenshotUrl}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-xl border border-border/60 bg-muted/40"
          >
            <img
              src={screenshotUrl}
              alt={`Booking confirmation for ${hospital}`}
              className="max-h-64 w-full object-contain object-top"
              loading="lazy"
            />
            <p className="border-t border-border/50 px-3 py-1.5 text-center text-[11px] font-medium text-muted-foreground">
              Tap to open confirmation screenshot
            </p>
          </a>
        ) : null}

        {!ok ? (
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
