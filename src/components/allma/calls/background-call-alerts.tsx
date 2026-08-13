import { useEffect, useState } from "react";
import { BellRing, Loader2, Share, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  disableBackgroundCallAlerts,
  enableBackgroundCallAlerts,
  readPushState,
  type PushState,
} from "@/lib/push";

const copy: Record<PushState, { title: string; detail: string }> = {
  enabled: {
    title: "Background call alerts are on",
    detail:
      "This device will ring for incoming Allma calls even when the app is closed. Alerts arrive as notifications — there is no full-screen native ringer on the web.",
  },
  prompt: {
    title: "Ring me when Allma is closed",
    detail:
      "Turn on notifications so incoming Allma calls reach this device when the app is in the background.",
  },
  denied: {
    title: "Notifications are blocked",
    detail:
      "Allow notifications for this site in your browser settings, then reload to enable background call alerts.",
  },
  "ios-needs-install": {
    title: "Add Allma to your Home Screen first",
    detail:
      "On iPhone and iPad, background alerts only work once Allma is installed: tap Share, then Add to Home Screen, and open it from there.",
  },
  "not-configured": {
    title: "Background alerts aren't available yet",
    detail: "Push delivery isn't configured for this deployment.",
  },
  unsupported: {
    title: "This browser can't do background alerts",
    detail:
      "Incoming calls will only ring while Allma is open in this browser. Try Chrome on Android or an installed Allma app.",
  },
};

export function BackgroundCallAlerts() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void readPushState().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const next = await enableBackgroundCallAlerts();
      setState(next);
      if (next === "enabled") toast.success("Background call alerts are on for this device.");
      else toast.error(copy[next].detail);
    } catch {
      toast.error("We could not turn on background call alerts.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await disableBackgroundCallAlerts();
      setState("prompt");
      toast.message("Background call alerts turned off for this device.");
    } finally {
      setBusy(false);
    }
  };

  if (!state) return null;
  const text = copy[state];

  return (
    <section className="rounded-[1.75rem] border border-border/60 bg-card/80 p-5 shadow-soft backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          {state === "enabled" ? (
            <ShieldCheck className="h-4.5 w-4.5" />
          ) : state === "ios-needs-install" ? (
            <Share className="h-4.5 w-4.5" />
          ) : (
            <BellRing className="h-4.5 w-4.5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-tight">{text.title}</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{text.detail}</p>

          {(state === "prompt" || state === "enabled") && (
            <Button
              type="button"
              size="sm"
              variant={state === "enabled" ? "outline" : "default"}
              className="mt-3"
              disabled={busy}
              onClick={() => void (state === "enabled" ? disable() : enable())}
            >
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {state === "enabled" ? "Turn off on this device" : "Enable background alerts"}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
