import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, HeartHandshake, Loader2, ShieldCheck, Siren } from "lucide-react";
import {
  SIGNAL_LABELS,
  confidenceCopy,
  type Confidence,
  type SignalKey,
} from "@/lib/smart-sos";
import { cn } from "@/lib/utils";

type Props = {
  phase: "idle" | "checking" | "elevated";
  signals: SignalKey[];
  confidence: Confidence;
  secondsLeft: number;
  autoSecondsLeft: number | null;
  graceSeconds: number;
  escalationBlocked: string | null;
  audioActive: boolean;
  onSafe: () => void;
  onHelp: () => void;
};

/**
 * The safety check overlay. Nothing here activates SOS on its own — the user
 * either confirms they are safe or hands off to the existing SOS system.
 */
export function SmartSafetyCheck({
  phase,
  signals,
  confidence,
  secondsLeft,
  autoSecondsLeft,
  graceSeconds,
  escalationBlocked,
  audioActive,
  onSafe,
  onHelp,
}: Props) {
  const elevated = phase === "elevated";
  const copy = confidenceCopy(elevated ? "high" : confidence);
  const progress = graceSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / graceSeconds)) : 0;
  const activating = elevated && autoSecondsLeft !== null;

  return (
    <AnimatePresence>
      {phase !== "idle" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-end justify-center bg-background/80 p-4 backdrop-blur-md sm:items-center"
          role="alertdialog"
          aria-modal="true"
          aria-label={copy.title}
        >
          <motion.div
            initial={{ y: 24, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className={cn(
              "w-full max-w-md overflow-hidden rounded-[2rem] border bg-card p-6 shadow-soft",
              elevated ? "border-destructive/50" : "border-border/60",
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
                  elevated ? "bg-destructive/12" : "bg-primary/10",
                )}
              >
                {elevated ? (
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                ) : (
                  <HeartHandshake className="h-5 w-5 text-primary" />
                )}
              </span>
              <div className="min-w-0">
                <p className="font-display text-[19px] font-black tracking-[-0.02em]">{copy.title}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{copy.body}</p>
              </div>
            </div>

            {!elevated && (
              <div className="mt-5">
                <div className="flex items-center justify-between text-[11.5px] font-semibold text-muted-foreground">
                  <span>Waiting for your response</span>
                  <span className="tabular-nums">{secondsLeft}s</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    animate={{ width: `${progress * 100}%` }}
                    transition={{ ease: "linear", duration: 0.9 }}
                  />
                </div>
              </div>
            )}

            {signals.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {signals.map((signal) => (
                  <li key={signal} className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    {SIGNAL_LABELS[signal]}
                  </li>
                ))}
              </ul>
            )}

            {audioActive && (
              <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground/70">
                Sound is being analysed on your device only. Nothing is recorded, stored or uploaded.
              </p>
            )}

            {elevated && escalationBlocked && (
              <p className="mt-3 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                Automatic SOS is off for your account, so nothing has been sent yet. Tap “Activate SOS”
                to get help.
              </p>
            )}

            <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={onSafe}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border/70 px-4 py-3 text-[13px] font-bold transition hover:bg-accent"
              >
                <ShieldCheck className="h-4 w-4" />
                {elevated ? "I'm safe — cancel" : "I'm OK"}
              </button>
              <button
                type="button"
                onClick={onHelp}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-destructive px-4 py-3 text-[13px] font-bold text-destructive-foreground transition hover:opacity-90"
              >
                <Siren className="h-4 w-4" />
                {elevated ? "Activate SOS" : "I need help"}
              </button>
            </div>

            {phase === "checking" && secondsLeft === 0 && (
              <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking your safety signals…
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
