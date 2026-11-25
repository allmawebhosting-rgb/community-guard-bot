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
 * True when the user wants to book / schedule a medical appointment.
 * Must NOT be treated as a nearby-facility search (that only lists places).
 */
export function isAppointmentBookingAsk(text: string) {
  const t = text.trim();
  if (!t) return false;
  const bookVerb = /\b(book|booking|appoint(?:ment)?|reserve|schedule)\b/i.test(t);
  const medical =
    /\b(hospital|clinic|doctor|medical|appointment|checkup|check-up|consultation)\b/i.test(t);
  return bookVerb && medical;
}

/** User wants the appointment request emailed (not browser/phone booking). */
export function isBookingEmailAsk(text: string) {
  const t = text.trim();
  if (!t) return false;
  if (/^(email|e-mail)(\s+them|\s+the\s+clinic|\s+it)?[.!?]?$/i.test(t)) return true;
  return (
    /\b(book|booking|appoint(?:ment)?|reserve|schedule|send|request)\b/i.test(t) &&
    /\b(e-?mail|email)\b/i.test(t)
  );
}

/**
 * Only treat a follow-up as a clinic/hospital name when it looks like one.
 * Prevents "Call the doctor?", "Now", "Can it call it?" becoming
 * "Got it — I'll use Call the doctor?".
 */
export function looksLikeClinicName(text: string) {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t || t.length < 3 || t.length > 80) return false;
  if (/[?]/.test(t)) return false;
  if (/^(now|asap|soon|please|yes|ok|okay|sure|thanks|thank you)[.!]?$/i.test(t)) return false;
  if (/\b(call|dial|phone|email|e-mail|sms|whatsapp|text)\b/i.test(t)) return false;
  if (/\b(can you|could you|please|how do|what about|is there)\b/i.test(t)) return false;
  if (isBookingEmailAsk(t)) return false;
  if (isAppointmentBookingAsk(t)) return false;
  // Explicit medical place words, or a short multi-word proper name.
  if (
    /\b(hospital|clinic|chambers|medical|health\s*cent(?:re|er)|referral|doctors?)\b/i.test(t)
  ) {
    return true;
  }
  // "Jinja Main", "Mulago", "Nsambya" — letters/spaces/hyphens only, 1–6 words.
  if (!/^[A-Za-z0-9][A-Za-z0-9 .'-]*$/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length < 1 || words.length > 6) return false;
  // Single generic words are not clinic names.
  if (words.length === 1 && /^(doctor|hospital|clinic|appointment|checkup|tomorrow|today)$/i.test(t)) {
    return false;
  }
  return words.length >= 2 || /^[A-Z]/.test(t);
}

/** True when the last Allma message was the booking details opener. */
export function isBookingOpenerMessage(text: string | null | undefined) {
  const t = (text || "").trim();
  if (!t) return false;
  return (
    /I can book a hospital or clinic appointment/i.test(t) ||
    /Which clinic or hospital should I use/i.test(t) ||
    /Got it — .+ I'll use/i.test(t) ||
    /When do you want to go, and what'?s the reason/i.test(t) ||
    /online booking (was )?not available|phone.?booking|call the clinic/i.test(t) ||
    /book .+ by e-?mail|email the clinic an appointment/i.test(t)
  );
}

const BOOKING_TIME_RE =
  /\b(tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s*(am|pm)|morning|afternoon|evening|next week)\b/i;

/** User is answering the booking opener (clinic / time / reason) — not asking for a map. */
export function isBookingFollowUp(intakeText: string, lastAssistantText: string | null | undefined) {
  const t = intakeText.trim();
  if (!t || t.length > 200) return false;
  if (!isBookingOpenerMessage(lastAssistantText)) return false;
  // Chips that intentionally leave booking for a facility directory search.
  if (/\b(near(by|est)?|closest|near me|around me|find help|type a town|share my location)\b/i.test(t)) {
    return false;
  }
  if (/^(cancel|never ?mind|stop|no thanks)[.!]?$/i.test(t)) return false;
  return true;
}

export function bookingHasPreferredTime(text: string) {
  return BOOKING_TIME_RE.test(text.trim());
}

/** After they name a clinic with no time yet — keep them in booking, don't search places. */
export function bookingClinicAckReply(clinicName: string) {
  const name = clinicName.trim().replace(/\s+/g, " ");
  return `Got it — I'll use **${name}**.\n\nWhen do you want to go, and what's the reason for the visit in a short phrase?\n\n::suggest[Tomorrow morning checkup | This afternoon | Next Monday]`;
}

/** Follow-up was not a clinic name — ask clearly without pretending we picked one. */
export function bookingClarifyClinicReply() {
  return `Which hospital or clinic should I book — for example **Jinja Main Hospital** or **Jemia Doctors Chambers**?\n\n::suggest[Jinja Main Hospital | Jemia Doctors Chambers | Cancel booking]`;
}

/** Offer email handoff when online booking failed or the user asked to email. */
export function bookingEmailOfferReply(input?: { clinicEmail?: string | null; clinicName?: string | null }) {
  const email = (input?.clinicEmail || "").trim();
  const clinic = (input?.clinicName || "the clinic").trim();
  if (email) {
    return `I can email **${clinic}** an appointment request at **${email}**.\n\nConfirm the preferred time and reason in one short line, or tap below and I will send the handoff email.\n\n::suggest[Email them tomorrow morning checkup | Different time | Call instead]`;
  }
  return `I can email the clinic an appointment request.\n\nShare the clinic email address (or the clinic name if you want me to look it up), plus your preferred time and reason.\n\n::suggest[Use info@jinjahospital.go.ug | Call instead | Cancel booking]`;
}

/** Pull the first email address out of booking agent prose / tool summaries. */
export function extractBookingEmail(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
}

/** True when the user is explicitly asking for nearby places / directions. */
export function isExplicitNearbyAsk(text: string) {
  const t = text.trim();
  if (!t) return false;
  // "Book an appointment at a hospital" is booking, not a place directory search —
  // unless they also asked for nearest/nearby.
  if (
    isAppointmentBookingAsk(t) &&
    !/\b(near(by|est)?|closest|near me|around me)\b/i.test(t)
  ) {
    return false;
  }
  if (
    /\b(near(by|est)?|closest|directions?|find help|help nearby|nearby help|near me|take me to)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\bwhere (is|are|can)\b/i.test(t)) return true;
  // "check police", "find hospital", "need a clinic" — action + place type
  const place =
    /\b(hospital|clinic|pharmacy|doctor|health cent(?:re|er)|police(?:\s+station|\s+post)?|fire(?:\s+station|\s+brigade)?|ambulance|shelter)\b/i.test(
      t,
    );
  const action =
    /\b(find|check|show|get|need|look|search|send|guide|map|locate|call)\b/i.test(t);
  return place && action;
}

/**
 * Facility types that MUST be searched this turn.
 * Explicit "find hospital/police" wins; otherwise every non-reporting emergency
 * gets its playbook help types so nearby help cards always appear —
 * except during a live SOS, where situation questions must NOT dump clinics.
 */
function facilityTypesFromAsk(text: string): string[] {
  const types: string[] = [];
  if (/\bpolice(?:\s+station|\s+post)?\b/i.test(text)) types.push("police");
  if (/\b(?:hospital|clinic|pharmacy|doctor|health cent(?:re|er))\b/i.test(text)) {
    types.push("hospital");
  }
  if (/\bambulance\b/i.test(text)) types.push("ambulance");
  if (/\bfire(?:\s+station|\s+brigade|\s+service)?\b/i.test(text)) types.push("fire");
  if (/\b(?:shelter|safe house)\b/i.test(text)) types.push("shelter");
  return types;
}

export function nearbyHelpTypesForTurn(input: {
  directFacilityTypes: string[];
  directService: string | null;
  emergencyHelpTypes: readonly string[];
  isReporting: boolean;
  showDirectHelp: boolean;
  sosActive?: boolean;
  intakeText?: string;
  /** Mid-booking reply (e.g. "jinja main hospital") — never dump a clinic grid. */
  bookingFollowUp?: boolean;
}): string[] {
  const intake = input.intakeText ?? "";
  // Booking / scheduling an appointment must not force find_facilities.
  // "Book an appointment at a hospital" should start the booking flow, not a clinic list.
  if (input.bookingFollowUp) {
    return [];
  }
  if (
    isAppointmentBookingAsk(intake) &&
    !/\b(near(by|est)?|closest|near me|around me)\b/i.test(intake)
  ) {
    return [];
  }
  const explicitNearby = isExplicitNearbyAsk(intake);
  // Live SOS: only search places when the human clearly asks for them.
  // "What is wrong with Allan?" must answer the situation, not open a clinic grid.
  if (input.sosActive && !explicitNearby && !input.showDirectHelp) {
    return [];
  }
  if (input.showDirectHelp || (input.sosActive && explicitNearby)) {
    if (input.directFacilityTypes.length) return [...input.directFacilityTypes];
    const fromAsk = facilityTypesFromAsk(intake);
    if (fromAsk.length) return fromAsk;
    if (input.directService) {
      const mapped = facilityTypesFromAsk(String(input.directService));
      return mapped.length ? mapped : [input.directService];
    }
    // Generic "nearest / find help" with no place named → both.
    if (input.sosActive && explicitNearby) return ["police", "hospital"];
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

/**
 * Fallback SOS situation brief when the model cannot answer.
 * Calm human dispatcher tone — never a roster dump, system log, or
 * unverified "responders are on the way" claim.
 */
export function sosSituationReply(input: {
  personName?: string | null;
  emergencyType?: string | null;
  area?: string | null;
  locationShared?: boolean;
  situationCue?: string | null;
  participants?: string[];
  askerName?: string | null;
  personActiveInChat?: boolean | null;
}) {
  const person = (input.personName || "The person in need").trim();
  const firstName = person.split(/\s+/)[0] || person;
  const asker = (input.askerName || "").trim().split(/\s+/)[0] || null;
  const pronoun = "they";
  const possessive = "their";
  const cue = (input.situationCue || "").trim().replace(/\s+/g, " ");
  const cueLine = cue
    ? cue.length > 140
      ? `${cue.slice(0, 137)}…`
      : cue
    : null;

  // Soft rewrite for first-person cues: "my nose is bleeding" → "their nose is bleeding"
  const condition = (() => {
    if (!cueLine) {
      const raw = (input.emergencyType || "").toLowerCase();
      if (raw === "medical") return "a medical emergency";
      if (raw === "crime") return "a personal-safety emergency";
      if (raw === "fire") return "a fire emergency";
      if (raw) return `a ${raw} emergency`;
      return "an active emergency";
    }
    let detail = cueLine;
    detail = detail.replace(/\bI('m| am)\b/gi, `${pronoun}'re`);
    detail = detail.replace(/\bI'm\b/gi, `${pronoun}'re`);
    detail = detail.replace(/\bmy\b/gi, possessive);
    if (/^[A-Z]/.test(detail)) {
      detail = detail.charAt(0).toLowerCase() + detail.slice(1);
    }
    return detail;
  })();

  const opening = asker
    ? `${asker}, ${firstName} is dealing with ${condition}.`
    : `${firstName} is dealing with ${condition}.`;

  const locationLine = input.locationShared
    ? input.area && !/^live gps/i.test(input.area)
      ? `${firstName} is at ${input.area} — the live GPS pin is on the map in this chat.`
      : `${possessive.charAt(0).toUpperCase()}${possessive.slice(1)} live GPS pin is updating on the map in this chat.`
    : input.area
      ? `Last area noted was ${input.area}; we're still waiting on a precise pin.`
      : `We're still waiting for ${firstName} to share a live location pin.`;

  const activityLine =
    input.personActiveInChat === true
      ? `${firstName} has been messaging here, so stay with them on this line.`
      : input.personActiveInChat === false
        ? `I haven't seen a fresh message from ${firstName} just now — keep checking in with them here.`
        : null;

  const medical = (input.emergencyType || "").toLowerCase() === "medical";
  const next = medical
    ? `Can you reach ${firstName} right now, or should someone call Ambulance 911 / Toll-free 112 while I stay on the line and check breathing and bleeding one step at a time?`
    : `Are you close enough to reach them, or should someone call Police 999 / Toll-free 112 while I stay with them here?`;

  return [opening, locationLine, activityLine, next, "", "::suggest[I'm close by | First aid steps | Call 999]"]
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

export const BOOKING_OPENER =
  "I can book a hospital or clinic appointment for you.\n\nWhich clinic or hospital should I use, and when do you want to go? Also tell me the reason for the visit in a short phrase.\n\n::suggest[Jemia Doctors Chambers | Jinja Main Hospital | Nearest clinic near me]";

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

  // Vague booking ask with no clinic/time yet — collect details before the VPS agent runs.
  // Runs before hard-flow short-circuit so "Book an appointment" can leave Reporting / Missing person.
  if (
    isAppointmentBookingAsk(text) &&
    text.length < 100 &&
    !/\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s*(am|pm)|morning|afternoon|evening)\b/i.test(
      text,
    )
  ) {
    return BOOKING_OPENER;
  }

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
