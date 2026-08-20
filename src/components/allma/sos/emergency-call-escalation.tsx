import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Phone, PhoneOff, ShieldCheck, SquareStop } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/allma/safety-network/add-safety-contact";
import { ATTEMPT_COPY, attemptState, listSosCallTargets, type SosCallTarget } from "@/lib/sos-calling";
import { getSosEscalation, type EscalationState } from "@/lib/sos-escalation-controller";

/**
 * Sequential emergency calling over the real in-app call system.
 * Every status shown here comes from an actual call row — nothing is simulated.
 * The dialing itself lives in a shared controller so a single sequence runs per
 * emergency even when this card is mounted in both layouts.
 */
export function EmergencyCallEscalation({
  activityId,
  emergencyType,
  autoStart = true,
}: {
  activityId: string | null;
  emergencyType: string;
  autoStart?: boolean;
}) {
  // Keyed on the emergency only: re-keying on the emergency type used to drop
  // the subscription and kill the running dialer mid-emergency.
  const controller = useMemo(
    () => (activityId ? getSosEscalation(activityId, emergencyType) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activityId],
  );
  const [state, setState] = useState<EscalationState | null>(controller?.state ?? null);
  // The network is shown as soon as it loads, even before the SOS session id
  // exists — waiting on the session used to leave this card stuck on loading.
  const [preTargets, setPreTargets] = useState<SosCallTarget[] | null>(null);
  const [preError, setPreError] = useState(false);
  const [preRetry, setPreRetry] = useState(0);

  useEffect(() => {
    controller?.setEmergencyType(emergencyType);
  }, [controller, emergencyType]);

  useEffect(() => {
    if (controller) return;
    let cancelled = false;
    setPreError(false);

    listSosCallTargets()
      .then((targets) => {
        if (!cancelled) setPreTargets(targets);
      })
      .catch(() => {
        if (!cancelled) {
          setPreTargets([]);
          setPreError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [controller]);

  useEffect(() => {
    if (!controller) return;
    setState({ ...controller.state });
    const unsubscribe = controller.subscribe(() => setState({ ...controller.state }));
    void controller.init(autoStart);
    return () => {
      unsubscribe();
    };
  }, [autoStart, controller]);

  const targets = controller ? (state?.targets ?? []) : (preTargets ?? []);
  const callableCount = targets.length;
  const attempts = state?.attempts ?? [];
  const answered = state?.answered ?? null;
  const running = Boolean(state?.running);
  const loading = controller ? (state?.loading ?? true) : preTargets === null;
  const errored = controller ? Boolean(state?.error) : preError;


  const rows = targets.map((target) => ({
    target,
    attempt: [...attempts].reverse().find((row) => row.recipient_id === target.member_id),
  }));

  const start = () => {
    if (!controller) {
      toast.error("Your emergency session is still starting.");
      return;
    }
    controller.start();
  };

  return (
    <div className="premium-surface overflow-hidden rounded-3xl border border-border/60 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 p-4 sm:p-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-destructive">
            Safety Network
          </p>
          <h3 className="mt-1 font-display text-lg font-black">Call your safety network</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Calling your responders one by one in your configured priority order.
          </p>
        </div>
        {answered ? (
          <span className="rounded-full border border-success/30 bg-success/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-success">
            {answered.full_name.split(" ")[0]} is responding
          </span>
        ) : running ? (
          <button
            type="button"
            onClick={() => controller?.stop()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-[11px] font-bold"
          >
            <SquareStop className="h-3.5 w-3.5" /> Stop calling
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={loading || !callableCount || !activityId}
            className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-3.5 py-2 text-[11px] font-bold text-background disabled:opacity-50"
          >
            <Phone className="h-3.5 w-3.5" /> Call responders
          </button>
        )}
      </div>

      <div className="divide-y divide-border/60">
        {loading ? (
          <p className="p-4 text-[12px] text-muted-foreground">Loading your Safety Network…</p>
        ) : errored ? (
          <div className="space-y-3 p-4">
            <p className="text-[12px] text-muted-foreground">Couldn't load your Safety Network.</p>
            <button
              type="button"
              onClick={() => {
                if (controller) void controller.retry(autoStart);
                else setPreTargets(null);
              }}

              className="rounded-xl border border-border/70 bg-secondary px-3 py-2 text-[11px] font-bold text-foreground transition hover:bg-accent"
            >
              Retry
            </button>
          </div>
        ) : !rows.length ? (
          <div className="space-y-2 p-4">
            <p className="text-[12px] font-bold">Your Safety Network is empty.</p>
            <p className="text-[11px] text-muted-foreground">
              Add trusted people so Allma can contact them during an emergency.
            </p>
            <Link
              to="/profile"
              className="inline-flex rounded-xl border border-border/70 bg-secondary px-3 py-2 text-[11px] font-bold text-foreground transition hover:bg-accent"
            >
              Manage Safety Network
            </Link>
          </div>
        ) : (
          rows.map(({ target, attempt }, index) => {
            const isCurrent = running && state?.currentIndex === index && !answered;
            const isAnswered = answered?.recipient_id === target.member_id;
            const derived = attempt ? attemptState(attempt.status) : null;
            const copy = derived ? ATTEMPT_COPY[derived] : null;
            const label = isAnswered
              ? "CONNECTED"
              : isCurrent
                ? derived === "calling"
                  ? "RINGING"
                  : "CALLING"
                : derived
                  ? (copy?.label ?? "NEXT").toUpperCase()
                  : "NEXT";
            return (
              <div key={target.member_id} className="flex items-center gap-3 p-3.5">
                <Avatar name={target.full_name} url={target.avatar_url} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">{target.full_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {target.safety_role || "Safety contact"} · priority {target.priority}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-[0.12em]",
                    isAnswered ? "text-success" : (copy?.tone ?? "text-muted-foreground"),
                    isCurrent && !isAnswered && "text-gold",
                  )}
                >
                  {label}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="space-y-1.5 border-t border-border/60 p-4">
        {running && !answered && (state?.round ?? 0) > 0 && (
          <p className="text-[11px] font-semibold text-gold">
            Round {state?.round}
            {state?.waitSeconds
              ? ` · next contact in ${state.waitSeconds}s`
              : state && state.currentIndex >= 0
                ? ` · ringing ${targets[state.currentIndex]?.full_name.split(" ")[0] ?? ""}`
                : ""}
          </p>
        )}
        {!running && !answered && (state?.round ?? 0) > 0 && (
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gold">
            <PhoneOff className="h-3.5 w-3.5" /> Calling stopped — no responder answered yet.
          </p>
        )}
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          Calls stay inside Allma — phone numbers are never shared. Calling continues while this
          screen stays open.
        </p>
      </div>
    </div>
  );
}
