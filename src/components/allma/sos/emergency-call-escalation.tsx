import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Phone, PhoneOff, ShieldCheck, SquareStop } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/allma/safety-network/add-safety-contact";
import { ATTEMPT_COPY, attemptState, listSosCallTargets, type SosCallTarget } from "@/lib/sos-calling";
import { getSosEscalation, type EscalationState } from "@/lib/sos-escalation-controller";

/**
 * Parallel emergency calling over the real in-app call system.
 * Every status shown here comes from an actual call row — nothing is simulated.
 * The dialing itself lives in a shared controller so a single sequence runs per
 * emergency even when this card is mounted in both layouts.
 */
export function EmergencyCallEscalation({
  activityId,
  emergencyType,
  autoStart = true,
  compact = false,
  /** Run dialing without rendering the card UI (header already shows status). */
  silent = false,
  microphoneStream,
  shareLocation = false,
}: {
  activityId: string | null;
  emergencyType: string;
  autoStart?: boolean;
  compact?: boolean;
  silent?: boolean;
  microphoneStream?: MediaStream;
  shareLocation?: boolean;
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
    controller?.setMicrophoneStream(microphoneStream);
    controller?.setLocationConsent(shareLocation);
  }, [controller, emergencyType, microphoneStream, shareLocation]);

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
  }, [controller, preRetry]);

  useEffect(() => {
    if (!controller) return;
    setState({ ...controller.state });
    const unsubscribe = controller.subscribe(() => setState({ ...controller.state }));
    void controller.init(autoStart);
    return () => {
      unsubscribe();
    };
  }, [autoStart, controller]);

  // Auto-start from the loaded, visible list as well as from controller.init().
  // This closes a mount/loading race where the targets finish loading after the
  // initial init call but the sequence is never armed.
  useEffect(() => {
    if (
      !autoStart ||
      !controller ||
      !state ||
      state.loading ||
      state.running ||
      state.answered ||
      state.targets.length === 0
    ) {
      return;
    }
    controller.start();
  }, [autoStart, controller, state]);

  const targets = controller ? (state?.targets ?? []) : (preTargets ?? []);
  const callableCount = targets.filter((target) => !target.ineligible_reason).length;
  const attempts = state?.attempts ?? [];
  const answered = state?.answered ?? null;
  const running = Boolean(state?.running);
  const loading = controller ? (state?.loading ?? true) : preTargets === null;
  const errored = controller ? Boolean(state?.error) : preError;


  const rows = targets.map((target) => ({
    target,
    attempt: [...attempts].reverse().find((row) => row.recipient_id === target.member_id),
  }));

  if (silent) return null;

  if (compact) {
    const current = answered
      ? rows.find(({ target }) => target.member_id === answered.recipient_id)
      : rows.find(({ attempt }) => {
          const status = attempt ? attemptState(attempt.status) : null;
          return status === "calling" || status === "alerted";
        });
    const currentLabel = answered
      ? answered.status === "connected"
        ? "CONNECTED"
        : "ANSWERED"
      : running
        ? "ALERTING"
        : attempts.length > 0
          ? "NO ANSWER"
          : "Preparing";

    const reachedCount = rows.filter(({ attempt, target }) => {
      if (target.ineligible_reason) return false;
      const derived = attempt ? attemptState(attempt.status) : null;
      return Boolean(
        attempt && (attempt.accepted_at || attempt.connected_at || derived === "answered"),
      );
    }).length;
    const notifiedCount = rows.filter(({ attempt, target }) => {
      if (target.ineligible_reason) return false;
      const derived = attempt ? attemptState(attempt.status) : null;
      return (
        !attempt?.accepted_at &&
        !attempt?.connected_at &&
        (derived === "calling" || derived === "alerted")
      );
    }).length;
    const progressCount = reachedCount + notifiedCount;
    const progress = callableCount ? Math.round((progressCount / callableCount) * 100) : 0;

    return (
      <section aria-label="Safety Network response" className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[12px] font-bold leading-tight text-foreground">
            {answered
              ? `${current?.target.full_name ?? "Responder"} is responding`
              : running
                ? "Escalating emergency call to Safety Network..."
                : loading
                  ? "Loading Safety Network…"
                  : `Safety Network (${callableCount})`}
          </p>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]",
              answered?.status === "connected"
                ? "border-success/40 bg-success/10 text-success"
                : answered
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : "border-border/70 bg-muted/40 text-muted-foreground",
            )}
          >
            {currentLabel}
          </span>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-medium text-muted-foreground">
          <span>Responders notified: {progressCount}/{callableCount}</span>
          {current && !answered ? (
            <span className="truncate text-foreground/70">{current.target.full_name}</span>
          ) : null}
        </div>
        <div
          className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Safety Network responders notified"
          aria-valuemin={0}
          aria-valuemax={callableCount}
          aria-valuenow={progressCount}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-destructive to-gold transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <details className="group mt-1">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md py-0.5 text-[10px] font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span>View details ({rows.length})</span>
            <ChevronDown
              aria-hidden="true"
              className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="mt-1 max-h-24 space-y-1 overflow-y-auto border-t border-border/60 pt-1">
            {loading && (
              <p className="py-1 text-[11px] text-muted-foreground">Loading your Safety Network…</p>
            )}
            {!loading && errored && (
              <div className="flex items-center justify-between gap-2 py-1">
                <p className="text-[11px] text-muted-foreground">
                  Couldn't load your Safety Network.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (controller) void controller.retry(autoStart);
                    else {
                      setPreTargets(null);
                      setPreRetry((value) => value + 1);
                    }
                  }}
                  className="shrink-0 text-[11px] font-semibold text-foreground underline"
                >
                  Retry
                </button>
              </div>
            )}
            {!loading && !errored && rows.length === 0 && (
              <p className="py-1 text-[11px] text-muted-foreground">
                No Safety Network members are available for this emergency.
              </p>
            )}
            {!loading && !errored && rows.length > 0 && callableCount === 0 && (
              <p role="status" className="py-1 text-[11px] text-muted-foreground">
                No contacts have enabled SOS alerts and in-app emergency calls.
              </p>
            )}
            {rows.map(({ target, attempt }) => {
              const derived = attempt ? attemptState(attempt.status) : null;
              const isAnswered = derived === "answered";
              const isCalling = derived === "calling";
              return (
                <div
                  key={target.member_id}
                  className={cn(
                    "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2 py-1 text-[11px]",
                    isAnswered
                      ? "border-success/45 bg-success/[0.07]"
                      : isCalling
                        ? "border-gold/55 bg-gold/[0.08]"
                        : "border-border/50 bg-card",
                  )}
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-bold text-foreground">
                    {target.full_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-foreground">
                      {target.full_name}
                    </span>
                    <span className="block truncate text-[9px] text-muted-foreground">
                      {target.ineligible_reason ?? target.safety_role ?? "Friend"}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[10.5px] font-bold uppercase tracking-[0.1em]",
                      isAnswered
                        ? "text-success"
                        : isCalling
                          ? "text-gold"
                          : "text-muted-foreground",
                    )}
                  >
                    {target.ineligible_reason
                      ? "Unavailable"
                      : isAnswered
                        ? attempt?.status === "connected"
                          ? "Connected"
                          : "Answered"
                        : isCalling
                          ? "Calling"
                          : derived === "alerted"
                            ? "Notified"
                            : "Waiting"}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      </section>
    );
  }

  const start = () => {
    if (!controller) {
      toast.error("Your emergency session is still starting.");
      return;
    }
    controller.start();
  };

  return (
    <div className="signal-escalation premium-surface overflow-hidden rounded-3xl border-2 border-destructive/40 bg-card shadow-lift">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-border/70 bg-destructive/10 p-5 sm:p-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-destructive">
            Safety Network
          </p>
          <h3 className="mt-2 font-display text-2xl font-black leading-tight text-foreground">Call your safety network</h3>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-foreground/80">
            Calling all available responders at once. The first person to answer connects.
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
            className="inline-flex items-center gap-2 rounded-xl border-2 border-border bg-background px-4 py-2.5 text-sm font-black text-foreground shadow-sm"
          >
            <SquareStop className="h-3.5 w-3.5" /> Stop calling
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={loading || !callableCount || !activityId}
            className="inline-flex items-center gap-2 rounded-xl bg-destructive px-5 py-3 text-sm font-black text-destructive-foreground shadow-md disabled:opacity-50"
          >
            <Phone className="h-3.5 w-3.5" /> Call responders
          </button>
        )}
      </div>

      <div className="divide-y divide-border/60">
        {loading ? (
          <p className="p-6 text-base font-bold text-foreground">Loading your Safety Network...</p>
        ) : errored ? (
          <div className="space-y-3 p-4">
            <p className="text-base font-bold text-foreground">Couldn't load your Safety Network.</p>
            <button
              type="button"
              onClick={() => {
                if (controller) void controller.retry(autoStart);
                else {
                  setPreTargets(null);
                  setPreRetry((value) => value + 1);
                }
              }}


              className="rounded-xl border-2 border-border bg-secondary px-4 py-2.5 text-sm font-black text-foreground transition hover:bg-accent"
            >
              Retry
            </button>
          </div>
        ) : !rows.length ? (
          <div className="space-y-3 bg-secondary/20 p-6">
            <p className="text-lg font-black text-foreground">Your Safety Network is empty.</p>
            <p className="text-sm font-semibold text-foreground/75">
              Add trusted people so Allma can contact them during an emergency.
            </p>
            <Link
              to="/profile"
              className="inline-flex rounded-xl border-2 border-border bg-secondary px-4 py-2.5 text-sm font-black text-foreground transition hover:bg-accent"
            >
              Manage Safety Network
            </Link>
          </div>
        ) : (
          rows.map(({ target, attempt }) => {
            const derived = attempt ? attemptState(attempt.status) : null;
            const isCurrent = running && !answered && (derived === "calling" || derived === "alerted");
            const isAnswered = answered?.recipient_id === target.member_id;
            const copy = derived ? ATTEMPT_COPY[derived] : null;
            const label = isAnswered
              ? answered?.status === "connected"
                ? "CONNECTED"
                : "ANSWERED"
              : target.ineligible_reason
                ? "UNAVAILABLE"
                : derived
                  ? (copy?.label ?? "NEXT").toUpperCase()
                  : "NEXT";
            return (
              <div key={target.member_id} className={cn("mx-3 my-2 flex items-center gap-4 rounded-2xl border-2 p-4 shadow-sm sm:mx-4", isAnswered ? "border-success/60 bg-success/10" : isCurrent ? "border-gold/70 bg-gold/10" : "border-border/70 bg-secondary/35")}>
                <Avatar name={target.full_name} url={target.avatar_url} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-black text-foreground">{target.full_name}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground/70">
                    {target.safety_role || "Safety contact"}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-sm font-black uppercase tracking-[0.08em]",
                    isAnswered ? "text-success" : target.ineligible_reason ? "text-muted-foreground" : (copy?.tone ?? "text-muted-foreground"),
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

      <div className="space-y-2 border-t-2 border-border/70 bg-secondary/20 p-5 sm:p-6">
        {running && !answered && (state?.round ?? 0) > 0 && (
          <p className="text-sm font-black text-gold">
            All contacts are called together · round {state?.round}
            {state?.waitSeconds
              ? ` · next round in ${state.waitSeconds}s`
                : ""}
          </p>
        )}
        {!running && !answered && (state?.round ?? 0) > 0 && (
          <p className="flex items-center gap-2 text-sm font-black text-gold">
            <PhoneOff className="h-3.5 w-3.5" /> Calling stopped — no responder answered yet.
          </p>
        )}
        {state?.error && (
          <p className="rounded-xl border-2 border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-black text-destructive">Call could not start: {state.error}</p>
        )}
        <p className="flex items-center gap-2 text-xs font-semibold text-foreground/70">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          Calls stay inside Allma — phone numbers are never shared. Calling continues while this
          screen stays open.
        </p>
      </div>
    </div>
  );
}
