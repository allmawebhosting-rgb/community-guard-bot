import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Phone, PhoneOff, ShieldCheck, SquareStop } from "lucide-react";
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
  microphoneStream,
}: {
  activityId: string | null;
  emergencyType: string;
  autoStart?: boolean;
  compact?: boolean;
  microphoneStream?: MediaStream;
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
  }, [controller, emergencyType, microphoneStream]);

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

  if (compact) {
    const currentIndex = state?.currentIndex ?? -1;
    const activeRows = rows.filter(
      ({ target }) => Math.min(Math.max(target.priority || 3, 1), 3) === state?.priority,
    );
    const current = answered
      ? rows.find(({ target }) => target.member_id === answered.recipient_id)
      : activeRows[currentIndex];
    const currentState = current?.attempt ? attemptState(current.attempt.status) : null;
    const currentLabel = answered
      ? "CONNECTED"
      : currentState === "calling"
        ? "Calling"
        : currentState === "alerted"
          ? "Notified"
          : !running && attempts.length > 0
            ? "Moving to next responder..."
            : "Preparing";

    return (
      <section aria-labelledby="response-heading" className="border-b border-border/60 pb-5 pt-1">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Response</p>
            <h2 id="response-heading" className="mt-2 font-display text-xl font-bold leading-tight text-foreground">
              {answered ? `${current?.target.full_name ?? "Responder"} is responding` : state?.priority ? `Priority ${state.priority} contacts` : "Safety Network retrying"}
            </h2>
            <p className="mt-1 text-[11px] font-semibold text-muted-foreground">{activeRows.length}/{rows.length} contacts in this priority</p>
          </div>
          <span className={cn("shrink-0 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]", answered ? "text-success" : "text-muted-foreground")}>
            {currentLabel}
          </span>
        </div>
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-card text-sm font-bold text-foreground shadow-sm ring-1 ring-border/60">
            {current?.target.full_name.slice(0, 1).toUpperCase() ?? "—"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-foreground">{current?.target.full_name ?? "Safety Network"}</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">{answered ? "Voice connection established" : current?.target.safety_role ?? "Friend"}</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {rows.map(({ target, attempt }) => {
            const derived = attempt ? attemptState(attempt.status) : null;
            return (
              <div key={target.member_id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5 text-[12px]">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold text-foreground">{target.full_name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0"><span className="block truncate font-semibold text-foreground">{target.full_name}</span><span className="block truncate text-[10px] text-muted-foreground">{target.safety_role ?? "Friend"} · Priority {target.priority}</span></span>
                <span className={cn("shrink-0 font-semibold", derived === "answered" ? "text-success" : derived === "calling" ? "text-foreground" : "text-muted-foreground")}>
                  {derived === "answered" ? "Connected" : derived === "calling" ? "Calling" : derived === "alerted" ? "Notified" : "Waiting"}
                </span>
              </div>
            );
          })}
        </div>
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
          rows.map(({ target, attempt }, index) => {
            const isCurrent = running && !answered && Math.min(Math.max(target.priority || 3, 1), 3) === state?.priority;
            const isAnswered = answered?.recipient_id === target.member_id;
            const derived = attempt ? attemptState(attempt.status) : null;
            const copy = derived ? ATTEMPT_COPY[derived] : null;
            const label = isAnswered
              ? "CONNECTED"
              : derived
                  ? (copy?.label ?? "NEXT").toUpperCase()
                  : "NEXT";
            return (
              <div key={target.member_id} className={cn("mx-3 my-2 flex items-center gap-4 rounded-2xl border-2 p-4 shadow-sm sm:mx-4", isAnswered ? "border-success/60 bg-success/10" : isCurrent ? "border-gold/70 bg-gold/10" : "border-border/70 bg-secondary/35")}>
                <Avatar name={target.full_name} url={target.avatar_url} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-black text-foreground">{target.full_name}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground/70">
                    {target.safety_role || "Safety contact"} · priority {target.priority}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-sm font-black uppercase tracking-[0.08em]",
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

      <div className="space-y-2 border-t-2 border-border/70 bg-secondary/20 p-5 sm:p-6">
        {running && !answered && (state?.round ?? 0) > 0 && (
          <p className="text-sm font-black text-gold">
            Priority {state?.priority || 3} of 3 · round {state?.round}
            {state?.waitSeconds
              ? ` · next contact in ${state.waitSeconds}s`
              : state && state.currentIndex >= 0
                ? ` · ringing ${targets[state.currentIndex]?.full_name.split(" ")[0] ?? ""}`
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
