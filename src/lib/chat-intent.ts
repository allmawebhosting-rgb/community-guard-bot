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

/** True when the user is explicitly asking for nearby places / directions. */
export function isExplicitNearbyAsk(text: string) {
  return /\b(near(by|est)?|hospital|clinic|police station|fire station|ambulance|directions?|find help|closest|where (is|are|can)|take me to)\b/i.test(
    text.trim(),
  );
}

/**
 * Facility types that MUST be searched this turn.
 * Explicit "find hospital/police" wins; otherwise every non-reporting emergency
 * gets its playbook help types so nearby help cards always appear —
 * except during a live SOS, where situation questions must NOT dump clinics.
 */
export function nearbyHelpTypesForTurn(input: {
  directFacilityTypes: string[];
  directService: string | null;
  emergencyHelpTypes: readonly string[];
  isReporting: boolean;
  showDirectHelp: boolean;
  sosActive?: boolean;
  intakeText?: string;
}): string[] {
  const explicitNearby = isExplicitNearbyAsk(input.intakeText ?? "");
  // Live SOS: only search places when the human clearly asks for them.
  // "What is wrong with Allan?" must answer the situation, not open a clinic grid.
  if (input.sosActive && !explicitNearby && !input.showDirectHelp) {
    return [];
  }
  if (input.showDirectHelp || (input.sosActive && explicitNearby)) {
    if (input.directFacilityTypes.length) return [...input.directFacilityTypes];
    if (input.directService) return [input.directService];
    if (input.emergencyHelpTypes.length) return [...input.emergencyHelpTypes];
    return ["police", "hospital"];
  }
  if (!input.isReporting && input.emergencyHelpTypes.length) {
    return [...input.emergencyHelpTypes];
  }
  return [];
}

/** Responder / owner asking what happened in the active SOS room. */
export function isSosSituationQuestion(text: string) {
  const t = text.trim();
  if (!t || t.length > 160) return false;
  return (
    /\bwhat('?s| is| was)?\s+(the\s+)?(problem|matter|issue|emergency|situation|wrong)\b/i.test(t) ||
    /\bwhat happened\b|\bwhat('?s| is) going on\b|\bwho needs help\b|\bwhy (did|was|is) (the )?sos\b/i.test(
      t,
    ) ||
    /\b(how is|is)\s+\w+\b.*\b(ok|okay|safe|hurt|bleeding|injured)\b/i.test(t) ||
    /\b(problem|wrong|happen(?:ed)?|matter|issue)\b.*\b(with|to)\b/i.test(t) ||
    /\bstatus\b|\bupdate (me|us)\b|\bbrief me\b/i.test(t)
  );
}

/** Plain-language SOS answer — sounds like a coordinator, not a product menu. */
export function sosSituationReply(input: {
  personName?: string | null;
  emergencyType?: string | null;
  area?: string | null;
  locationShared?: boolean;
  situationCue?: string | null;
  participants?: string[];
}) {
  const person = (input.personName || "The person in need").trim();
  const typeLabel = (() => {
    const raw = (input.emergencyType || "").toLowerCase();
    if (raw === "medical") return "a medical emergency";
    if (raw === "crime") return "a crime / personal-safety emergency";
    if (raw === "fire") return "a fire emergency";
    if (raw) return `a ${raw} emergency`;
    return "an active emergency";
  })();
  const cue = (input.situationCue || "").trim();
  const cueLine = cue
    ? cue.length > 140
      ? `${cue.slice(0, 137)}…`
      : cue
    : null;
  const where = input.area
    ? input.locationShared
      ? `They shared their location (${input.area}).`
      : `Area: ${input.area} (exact pin may still be updating).`
    : input.locationShared
      ? "Their live location is shared in this chat."
      : null;
  const people =
    input.participants && input.participants.length
      ? `In this chat now: ${input.participants.join(", ")}.`
      : "The Safety Network is being alerted into this chat.";

  return [
    `${person} needs help — ${typeLabel}.`,
    cueLine ? `What we know from this chat: ${cueLine}` : null,
    where,
    people,
    "Stay here with us. Tell me what you need — first-aid steps, what to do when you arrive, or how to call emergency services.",
    "",
    "::suggest[First aid steps | What should I do? | Call 999]",
  ]
    .filter(Boolean)
    .join("\n");
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

export const FIRST_AID_OPENER =
  "I can guide you through first aid. What happened?\n\nTell me the injury or symptoms in a short sentence — for example a cut, burn, nosebleed, or someone who is unconscious.\n\n::suggest[Cut or bleeding | Burn | Unconscious | Something else]";

/** True when the user is asking for 999/112 — never search alerts or facilities. */
export function isEmergencyNumbersAsk(text: string) {
  return /\bemergency numbers?\b|\b(police|call)\s*999\b|\btoll[- ]?free\s*112\b|\bwhat (number|numbers) (do i|should i|to) call\b/i.test(
    text.trim(),
  );
}

/** Vague first-aid asks that need clarification before playbook steps. */
export function isFirstAidTopicAsk(text: string) {
  const t = text.trim();
  if (!t || t.length > 100) return false;
  // Concrete injuries are handled by the emergency playbook, not this opener.
  if (
    /\b(bleed|blood|burn|unconscious|faint|cut|wound|nose|fracture|broken|chok|seiz|snake|sting|poison|swell|sprain|head injury)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  return (
    /^(show|give|need|want|start|open)?\s*(me\s+)?(some\s+)?first[- ]?aid\b/i.test(t) ||
    /\b(first[- ]?aid|firstaid)\b/i.test(t)
  );
}

/** Case Timeline is only for active report progress — never for first aid or greetings. */
export function canUseCaseTimelineTool(input: {
  flowLabel: string | null;
  step: number;
  intakeText: string;
}) {
  if (/\b(case )?timeline|progress (on|of) (my )?(case|report)\b/i.test(input.intakeText)) {
    return true;
  }
  const reportFlows = new Set(["Reporting", "Report an incident", "Missing person", "Lost & found"]);
  return Boolean(input.flowLabel && reportFlows.has(input.flowLabel) && input.step >= 2);
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

  // Soft SOS situation questions are handled by the chat route with room state
  // (scriptedFlowOpener has no SOS room context here).

  // Hard report flows keep the model for follow-up answers.
  if (activeFlowLabel && !isSoftGuidedFlow(activeFlowLabel) && activeFlowLabel !== "Find help") {
    return null;
  }

  if (isFirstAidTopicAsk(text)) {
    return FIRST_AID_OPENER;
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
