import { useEffect, useState } from "react";
import { BellRing, Loader2, Share, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enableBackgroundCallAlerts, readPushState, type PushState } from "@/lib/push";
import { cn } from "@/lib/utils";

const SNOOZE_KEY = "allma-background-call-prompt-snooze-until";
/** Temporary snooze only — Safety Network closed-app rings need a recurring reminder. */
const SNOOZE_MS = 12 * 60 * 60 * 1000;

function isSnoozed() {
  if (typeof window === "undefined") return false;
  const until = Number(localStorage.getItem(SNOOZE_KEY) ?? "0");
  return Number.isFinite(until) && until > Date.now();
}

export function BackgroundCallPrompt({
  className,
  compact = false,
  force = false,
}: {
  className?: string;
  compact?: boolean;
  /** When true, ignore snooze (e.g. Safety Network / Call centre). */
  force?: boolean;
}) {
  const [state, setState] = useState<PushState | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDismissed(!force && isSnoozed());
    void readPushState().then(setState);
  }, [force]);

  if (dismissed || !state || (state !== "prompt" && state !== "ios-needs-install" && state !== "denied")) {
    return null;
  }

  const enable = async () => {
    setBusy(true);
    try {
      const next = await enableBackgroundCallAlerts();
      setState(next);
      if (next === "enabled") {
        localStorage.removeItem(SNOOZE_KEY);
        toast.success("This device will now alert you for Safety Network SOS calls when Allma is closed.");
      } else if (next === "denied") {
        toast.error("Notifications are blocked. Allow them in browser settings, then try again.");
      } else if (next !== "prompt" && next !== "ios-needs-install") {
        toast.error("Background alerts could not be enabled.");
      }
    } catch {
      toast.error("We could not enable background call alerts.");
    } finally {
      setBusy(false);
    }
  };

  const snooze = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    setDismissed(true);
  };

  return (
    <section
      className={cn(
        "rounded-2xl border-2 border-primary/40 bg-primary/10 p-4 shadow-soft sm:p-5",
        compact ? "mb-3" : "mb-5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {state === "ios-needs-install" ? (
          <Share className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
        ) : (
          <BellRing className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-black text-foreground">
              {state === "denied"
                ? "Notifications are blocked"
                : "Turn on Safety Network alerts"}
            </h2>
            {!force && (
              <button
                type="button"
                onClick={snooze}
                aria-label="Remind me later"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          <p className="mt-1 text-sm font-medium leading-relaxed text-foreground/75">
            {state === "ios-needs-install"
              ? "On iPhone, add Allma to your Home Screen first (Share → Add to Home Screen), then open it from there and enable alerts."
              : state === "denied"
                ? "Allow notifications for Allma in your browser or phone settings, reload, then tap Enable."
                : "Enable notifications so an SOS call from your Safety Network can reach this phone when Allma is closed or in the background."}
          </p>
          {state === "ios-needs-install" ? (
            <p className="mt-3 flex items-center gap-2 text-sm font-bold text-primary">
              <Share className="h-4 w-4" /> Use Share, then Add to Home Screen
            </p>
          ) : state === "denied" ? null : (
            <Button type="button" className="mt-4" disabled={busy} onClick={() => void enable()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enable closed-app SOS alerts
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
