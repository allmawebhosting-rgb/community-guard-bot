import { useCallback } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useSmartSosDetection } from "@/hooks/useSmartSosDetection";
import { SmartSafetyCheck } from "@/components/allma/sos/smart-safety-check";

/**
 * Mounts the smart detection layer for signed-in users. Detection is paused on
 * the SOS screen itself (SOS is already running there). On escalation we hand
 * off to the existing SOS experience — this component never contacts anyone.
 */
export function SmartSosGuardian() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const paused = pathname.startsWith("/sos") || pathname.startsWith("/auth") || pathname.startsWith("/onboarding");

  const onEscalate = useCallback(
    ({ checkId }: { checkId: string }) => {
      void navigate({ to: "/sos", search: { instant: true, check: checkId } });
    },
    [navigate],
  );

  const detection = useSmartSosDetection({ userId: user?.id ?? null, paused, onEscalate });

  if (!user || paused) return null;

  return (
    <SmartSafetyCheck
      phase={detection.phase}
      signals={detection.signals}
      confidence={detection.confidence}
      secondsLeft={detection.secondsLeft}
      graceSeconds={detection.settings.grace_seconds}
      escalationBlocked={detection.escalationBlocked}
      audioActive={detection.audioActive}
      onSafe={() => void detection.confirmSafe()}
      onHelp={() => void detection.requestHelp()}
    />
  );
}
