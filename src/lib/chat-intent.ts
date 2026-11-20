const REPORTING_FLOWS = new Set(["Reporting", "Report an incident"]);
const REPORTING_LANGUAGE =
  /\b(report|stolen|theft|robbed|robbery|mugged|assault|harass(?:ment|ed)?|attacked|threatened|burglary|fraud|lost my)\b/i;

export function isReportingIntent(input: {
  flowLabel: string | null;
  matchedFlow?: string;
  intakeText: string;
}) {
  return (
    REPORTING_FLOWS.has(input.flowLabel ?? "") ||
    REPORTING_FLOWS.has(input.matchedFlow ?? "") ||
    REPORTING_LANGUAGE.test(input.intakeText)
  );
}

/** Soft flows the user can leave instantly when they ask for nearby help. */
const INTERRUPTIBLE_FLOWS = new Set(["Safety check", "Advice", "Find help"]);

export function shouldShowDirectHelp(
  directService: string | null,
  isReporting: boolean,
  activeFlow: string | null,
  isEmergency = false,
) {
  const anotherFlowIsActive = Boolean(
    activeFlow && !INTERRUPTIBLE_FLOWS.has(activeFlow),
  );
  return Boolean(directService) && !isReporting && !anotherFlowIsActive && !isEmergency;
}

/** Flows that must never block medical first-aid or facility search. */
export function isSoftGuidedFlow(flowLabel: string | null | undefined) {
  return flowLabel === "Safety check" || flowLabel === "Advice";
}

export function shouldLoadReportingPrompt(input: {
  isReportFlow: boolean;
  isReporting: boolean;
  intakeText: string;
}) {
  return (
    input.isReportFlow ||
    input.isReporting ||
    /\b(report|incident|crime|theft|robbery|assault|burglary|fraud|missing person|lost item|found item|stolen|kidnap|abduct)\b/i.test(
      input.intakeText,
    )
  );
}
