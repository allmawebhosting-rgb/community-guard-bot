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

/**
 * Facility types that MUST be searched this turn.
 * Explicit "find hospital/police" wins; otherwise every non-reporting emergency
 * gets its playbook help types so nearby help cards always appear.
 */
export function nearbyHelpTypesForTurn(input: {
  directFacilityTypes: string[];
  directService: string | null;
  emergencyHelpTypes: readonly string[];
  isReporting: boolean;
  showDirectHelp: boolean;
}): string[] {
  if (input.showDirectHelp) {
    if (input.directFacilityTypes.length) return [...input.directFacilityTypes];
    if (input.directService) return [input.directService];
    return ["police", "hospital"];
  }
  if (!input.isReporting && input.emergencyHelpTypes.length) {
    return [...input.emergencyHelpTypes];
  }
  return [];
}

const FILING_TOOL_NAMES = new Set(["report_summary", "create_report"]);

/**
 * Filing tools are only safe after the guided report has collected real detail.
 * Exposing them on "I want to report a crime" made the model skip the flow and
 * emit empty REPORT SUMMARY cards.
 */
export function canUseFilingTools(input: {
  flowLabel: string | null;
  step: number;
  askedTitles: string[];
}) {
  const reportFlows = new Set(["Reporting", "Report an incident", "Missing person", "Lost & found"]);
  if (!input.flowLabel || !reportFlows.has(input.flowLabel)) return false;
  return input.step >= 3 || input.askedTitles.length >= 3;
}

export function isFilingToolName(name: string) {
  return FILING_TOOL_NAMES.has(name);
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
