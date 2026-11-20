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

export const EMERGENCY_NUMBERS_REPLY =
  "Here are Uganda's emergency numbers:\n\n- Police 999\n- Toll-free emergency 112\n\nIf someone is in immediate danger, call now.\n\n::suggest[Report a crime | Find help nearby | I'm safe now]";

export const REPORTING_OPENER =
  '::flow{type=Reporting, step=1, total=5, title="What kind of incident?"}\n\nWhat kind of incident is this?\n\n::suggest[Theft | Robbery | Assault | Something else]';

export const MISSING_PERSON_OPENER =
  '::flow{type=Missing person, step=1, total=5, title="Adult or child?"}\n\nIs the missing person an adult or a child?\n\n::suggest[An adult | A child]';

export const LOST_FOUND_OPENER =
  '::flow{type=Lost & found, step=1, total=4, title="Lost or found?"}\n\nDid you lose something or find something?\n\n::suggest[I lost something | I found something]';

/** True when the user is asking for 999/112 — never search alerts or facilities. */
export function isEmergencyNumbersAsk(text: string) {
  return /\bemergency numbers?\b|\b(police|call)\s*999\b|\btoll[- ]?free\s*112\b|\bwhat (number|numbers) (do i|should i|to) call\b/i.test(
    text.trim(),
  );
}

/**
 * Deterministic replies for clear chip/menu asks. No model, no tools —
 * stops empty REPORT SUMMARY / NEARBY HELP / Done cards on common intents.
 */
export function scriptedFlowOpener(intakeText: string, activeFlowLabel: string | null): string | null {
  const text = intakeText.trim();
  if (!text || text.length > 120) return null;

  // Always answer emergency-number asks — even mid soft-flow.
  if (isEmergencyNumbersAsk(text)) {
    return EMERGENCY_NUMBERS_REPLY;
  }

  // Hard report flows keep the model for follow-up answers.
  if (activeFlowLabel && !isSoftGuidedFlow(activeFlowLabel) && activeFlowLabel !== "Find help") {
    return null;
  }

  if (
    /^(report a crime|i want to report( a crime)?|i need to report( a crime)?|report (an )?incident|file a report)[.!]?$/i.test(
      text,
    ) ||
    (/report (a )?(crime|theft|robbery|assault|burglary|fraud)/i.test(text) && text.length < 60)
  ) {
    return REPORTING_OPENER;
  }

  if (/missing person|report a missing (person|child)/i.test(text) && text.length < 80) {
    return MISSING_PERSON_OPENER;
  }

  if (
    /^(lost (and|&) found|i lost something|i found something|report lost|report found)[.!]?$/i.test(text) ||
    (/\b(lost|found)\b/i.test(text) && /report|something|item|property/i.test(text) && text.length < 60)
  ) {
    return LOST_FOUND_OPENER;
  }

  return null;
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
