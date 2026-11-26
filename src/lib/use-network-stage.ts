import { useEffect, useState } from "react";
import { peekSosEscalation, type EscalationState } from "@/lib/sos-escalation-controller";
import { networkStage, type NetworkStageInfo } from "@/lib/sos-stage";

/** No Safety Network dialer for this SOS after this long means there is nothing to wait for. */
const DIALER_APPEAR_MS = 10_000;

/** Live progress of the Safety Network steps for one SOS (null while there is no SOS). */
export function useNetworkStage(activityId: string | null): {
  info: NetworkStageInfo | null;
  telecomMessage: string | null;
} {
  const [state, setState] = useState<EscalationState | null>(null);
  const [noDialer, setNoDialer] = useState(false);

  useEffect(() => {
    setNoDialer(false);
    if (!activityId) {
      setState(null);
      return;
    }
    let unsubscribe: (() => void) | null = null;
    const attach = () => {
      if (unsubscribe) return true;
      const controller = peekSosEscalation(activityId);
      if (!controller) return false;
      setState(controller.state);
      unsubscribe = controller.subscribe(() => setState(controller.state));
      return true;
    };
    attach();
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (attach()) clearInterval(timer);
      else if (Date.now() - startedAt > DIALER_APPEAR_MS) {
        setNoDialer(true);
        clearInterval(timer);
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      unsubscribe?.();
    };
  }, [activityId]);

  if (!activityId) return { info: null, telecomMessage: null };
  if (!state && noDialer) return { info: { stage: "done", release: true, outcome: null }, telecomMessage: null };
  return { info: networkStage(state), telecomMessage: state?.telecom.message ?? null };
}
