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

/** Deterministic first-step openers — no model, no tools, no empty summary cards. */
const SCRIPTED_FLOW_OPENERS: Array<{ matches: RegExp; reply: string }> = [
  {
    matches:
      /^(report a crime|i want to report( a crime)?|i need to report( a crime)?|report (an )?incident|file a report)[.!]?$/i,
    reply:
      '::flow{type=Reporting, step=1, total=5, title="What kind of incident?"}\n\nWhat kind of incident is this?\n\n::suggest[Theft | Robbery | Assault | Something else]',
  },
  {
    matches: /^(missing person|report a missing person|i want to report a missing person)[.!]?$/i,
    reply:
      '::flow{type=Missing person, step=1, total=5, title="Adult or child?"}\n\nIs the missing person an adult or a child?\n\n::suggest[An adult | A child]',
  },
  {
    matches: /^(lost (and|&) found|i lost something|i found something|report lost|report found)[.!]?$/i,
    reply:
      '::flow{type=Lost & found, step=1, total=4, title="Lost or found?"}\n\nDid you lose something or find something?\n\n::suggest[I lost something | I found something]',
  },
  {
    matches: /^(emergency numbers|get emergency numbers|what (are )?(the )?emergency numbers)[.!]?$/i,
    reply:
      "Here are Uganda's emergency numbers:\n\n- Police 999\n- Toll-free emergency 112\n\nIf someone is in immediate danger, call now.\n\n::suggest[Report a crime | Find help nearby | I'm safe now]",
  },
];

/**
 * Returns a fixed reply for clear menu/chip intents when no guided flow is
 * already open. Avoids model/tool misfires like empty REPORT SUMMARY cards.
 */
export function scriptedFlowOpener(intakeText: string, activeFlowLabel: string | null): string | null {
  if (activeFlowLabel) return null;
  const text = intakeText.trim();
  if (!text || text.length > 80) return null;
  for (const entry of SCRIPTED_FLOW_OPENERS) {
    if (entry.matches.test(text)) return entry.reply;
  }
  // Slightly looser crime-report phrasing still opens Reporting without tools.
  if (/report (a )?(crime|theft|robbery|assault|burglary|fraud)/i.test(text) && text.length < 60) {
    return SCRIPTED_FLOW_OPENERS[0].reply;
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
