import { useEffect, useState } from "react";
import { BellRing, Loader2, Share, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enableBackgroundCallAlerts, readPushState, type PushState } from "@/lib/push";

const DISMISSED_KEY = "allma-background-call-prompt-dismissed";

export function BackgroundCallPrompt() {
  const [state, setState] = useState<PushState | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
    void readPushState().then(setState);
  }, []);

  if (dismissed || (state !== "prompt" && state !== "ios-needs-install")) return null;

  const enable = async () => {
    setBusy(true);
    try {
      const next = await enableBackgroundCallAlerts();
      setState(next);
      if (next === "enabled") toast.success("Background call alerts are enabled on this device.");
      else if (next !== "prompt" && next !== "ios-needs-install") toast.error("Background alerts could not be enabled.");
    } catch {
      toast.error("We could not enable background call alerts.");
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  return (
    <section className="mb-5 rounded-2xl border-2 border-primary/40 bg-primary/10 p-5 shadow-soft">
      <div className="flex items-start gap-3">
        {state === "ios-needs-install" ? <Share className="mt-0.5 h-6 w-6 shrink-0 text-primary" /> : <BellRing className="mt-0.5 h-6 w-6 shrink-0 text-primary" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-black text-foreground">Make sure Allma can reach you</h2>
            <button type="button" onClick={dismiss} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
          </div>
          <p className="mt-1 text-sm font-medium leading-relaxed text-foreground/75">
            {state === "ios-needs-install" ? "Add Allma to your Home Screen first. Web push on iPhone works only from the installed app." : "Enable notifications so a Safety Network call can alert this device when your browser is closed. Web push is a notification, not a native full-screen ringer."}
          </p>
          {state === "ios-needs-install" ? <p className="mt-3 flex items-center gap-2 text-sm font-bold text-primary"><Share className="h-4 w-4" /> Use Share, then Add to Home Screen</p> : <Button type="button" className="mt-4" disabled={busy} onClick={() => void enable()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enable background alerts</Button>}
        </div>
      </div>
    </section>
  );
}