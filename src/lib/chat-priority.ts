import { firstAidFor, matchIncident, type Incident } from "@/lib/allma-emergency-playbook";
import { resolveUgandaPlace } from "@/lib/uganda-places";

/**
 * One fixed priority order for every chat message:
 *   1. safety check (emergency / urgent health / normal)
 *   2. the steps of that level, one at a time
 *   3. at most three chips, all about the current step
 * Pure and client-safe: the server decides the reply, the client trims what it shows.
 */

export type SafetyLevel = "emergency" | "urgent" | "normal";
export type EmergencyKind = "medical" | "crime" | "fire";

/** Incidents where health facilities are the right people to alert. */
export const HEALTH_EMERGENCY_IDS = new Set([
  "road_accident",
  "building_collapse",
  "fire",
  "gas_leak",
  "lightning",
  "assault",
  "sexual_assault",
  "not_breathing",
  "choking",
  "snake_bite",
  "allergy",
  "heart_attack",
  "stroke",
  "poisoning",
  "drowning",
  "electric_shock",
  "labour",
  "heat_stroke",
  "unconscious",
  "bleeding",
]);

/** Life-threatening incidents that start the emergency flow (police-first ones do not call hospitals). */
const EMERGENCY_IDS = new Set([
  ...HEALTH_EMERGENCY_IDS,
  "kidnapping",
  "break_in",
  "mob_violence",
  "being_followed",
  "flood",
  "landslide",
]);

export const HYPOTHETICAL =
  /\b(what (should|do|would) i do if|what to do (if|when)|how (do|can|to|should)\b|how (do|can) (you|i)|tips? (for|on)|in case (of|i)|prevent|preparing|first aid (course|training|kit)|for (a |my )?(school|class|project|story|essay)|just (asking|curious)|hypothetical|can you explain|what is a|what are the (signs|symptoms))\b/i;

export const PERSONAL_OR_PRESENT =
  /\b(i|i'm|im|i've|ive|we|we're|my|me|our|someone|somebody|he|she|they|there'?s|there is|a man|a woman|a child|a boy|a girl|a baby|friend|mother|father|mum|dad|brother|sister|husband|wife|son|daughter)\b/i;

export const SEVERE_BLEEDING =
  /\b(heav(y|ily)|sever(e|ely)|serious(ly)?|a lot|lots of|profuse|gushing|badly|won'?t stop|will not stop|can'?t stop|cannot stop|not stopping|blood everywhere|losing (a lot of )?blood)\b/i;

const PAST_EVENT =
  /\b(yesterday|last (night|week|month|year)|years? ago|months? ago|weeks? ago|days? ago|used to|a while ago|long ago)\b/i;

const QUESTION_START =
  /^\s*(how|what|why|when|where|which|who|can|could|should|is|are|do|does|tell me|explain)\b/i;

const CANCEL_RE =
  /\b(false alarm|never ?mind|not an emergency|cancel( that)?|i'?m (fine|ok|okay|safe now)|all (is )?(fine|good|well))\b/i;

const HELP_CALL = [
  /^\s*(please\s+)?(someone\s+)?help(\s+(me|us))?(\s+(please|now|quickly|fast))?\s*[!.]*\s*$/i,
  /^\s*(i|we)\s+need\s+(urgent\s+|emergency\s+)?(help|an ambulance|the police)(\s+(now|urgently|please|quickly|fast))?\s*[!.]*\s*$/i,
  /^\s*(sos|emergency)\s*[!.]*\s*$/i,
  /\bthis is an emergency\b/i,
  /\b(call|send) (me )?an ambulance\b/i,
];

const URGENT_SYMPTOM =
  /\b(pain|aches?|aching|fever|temperature|nose ?bleed|vomit(ing)?|diarrh?oea|headache|cough(ing)?|rash|dizz(y|iness)|swollen|swelling|sprain(ed)?|bitten|stung|burnt|burned|cut)\b/i;

export type SafetyAssessment = {
  level: SafetyLevel;
  incident: Incident | null;
  kind: EmergencyKind;
  reason: "sos_active" | "followup" | "report" | "help_call" | "sticky" | "incident" | "symptom" | "none";
  /** The user message that reported the emergency (differs from the latest when it is sticky). */
  reportText: string;
};

/** Sentence the location step always contains, so the next turn knows a location was asked. */
export const LOCATION_ASK = "Which town are you in? Tap Share my location, or just type the town.";
const LOCATION_ASK_RE = /which town are you in\?/i;

function emergencyIncident(text: string): Incident | null {
  const t = text.trim();
  if (!t || HYPOTHETICAL.test(t) || PAST_EVENT.test(t)) return null;
  const incident = matchIncident(t);
  if (!incident || !EMERGENCY_IDS.has(incident.id)) return null;
  const bareReport = !/\?/.test(t) && !QUESTION_START.test(t);
  if (!PERSONAL_OR_PRESENT.test(t) && !bareReport) return null;
  if (incident.id === "road_accident" && !/accident|crash|collision|knocked|hit by/i.test(t)) return null;
  if (incident.id === "fire" && !/\b(fire|burning|explosion)\b/i.test(t)) return null;
  if (incident.id === "bleeding" && !SEVERE_BLEEDING.test(t)) return null;
  return incident;
}

function isHelpCall(text: string) {
  return HELP_CALL.some((re) => re.test(text));
}

function baseAssessment(text: string): SafetyAssessment {
  const emergency = emergencyIncident(text);
  if (emergency) {
    return { level: "emergency", incident: emergency, kind: emergency.marker, reason: "report", reportText: text };
  }
  if (isHelpCall(text)) {
    return { level: "emergency", incident: null, kind: "medical", reason: "help_call", reportText: text };
  }
  const incident = matchIncident(text);
  const t = text.trim();
  const personal = PERSONAL_OR_PRESENT.test(t) && !HYPOTHETICAL.test(t) && !PAST_EVENT.test(t);
  if (personal && (incident || URGENT_SYMPTOM.test(t))) {
    return {
      level: "urgent",
      incident,
      kind: incident?.marker ?? "medical",
      reason: incident ? "incident" : "symptom",
      reportText: text,
    };
  }
  return { level: "normal", incident: null, kind: "medical", reason: "none", reportText: text };
}

/**
 * Step 1 of every message. `lastAssistantText` + `priorUserTexts` let a bare answer ("Jinja")
 * to the location question stay inside the emergency that asked for it.
 */
/**
 * A short answer to the incident's own follow-up question ("No, still bleeding" after
 * "Did the bleeding stop?") belongs to that incident, not to whatever its words match alone.
 */
export function continuedIncident(
  text: string,
  lastAssistantText: string | undefined,
  priorUserTexts: string[] = [],
): Incident | null {
  if (!lastAssistantText || text.trim().split(/\s+/).length > 8) return null;
  for (const earlier of [...priorUserTexts].reverse()) {
    const incident = matchIncident(earlier);
    if (!incident) continue;
    return incident.followUp && lastAssistantText.includes(incident.followUp) ? incident : null;
  }
  return null;
}

export function classifySafety(
  text: string,
  opts: { sosActive?: boolean; lastAssistantText?: string; priorUserTexts?: string[] } = {},
): SafetyAssessment {
  const base = baseAssessment(text);
  if (opts.sosActive) {
    return { ...base, level: "emergency", reason: base.level === "emergency" ? base.reason : "sos_active" };
  }
  if (base.level === "emergency") return base;
  const continued = continuedIncident(text, opts.lastAssistantText, opts.priorUserTexts);
  if (continued) {
    return { level: "urgent", incident: continued, kind: continued.marker, reason: "followup", reportText: text };
  }
  if (opts.lastAssistantText && LOCATION_ASK_RE.test(opts.lastAssistantText) && !CANCEL_RE.test(text)) {
    for (const earlier of [...(opts.priorUserTexts ?? [])].reverse()) {
      const prior = baseAssessment(earlier);
      if (prior.level === "emergency") return { ...prior, reason: "sticky" };
    }
  }
  return base;
}

/** True when the assessment should alert hospitals/clinics (police-first emergencies do not). */
export function contactsHospitals(a: SafetyAssessment) {
  return a.level === "emergency" && Boolean(a.incident) && HEALTH_EMERGENCY_IDS.has(a.incident!.id);
}

// ── Emergency reply ──────────────────────────────────────────────────────────

export const CALM_LINE = "Stay calm, help is coming.";

const GENERIC_STEPS = [
  "Move away from danger if you can.",
  "Stay where help can find you and keep your phone with you.",
];

function stepLine(step: string) {
  const t = step.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** The calm line plus the 1-3 most important first-aid steps. */
export function emergencyOpening(incident: Incident | null) {
  const steps = (incident ? firstAidFor(incident)?.steps : null)?.slice(0, 3).map(stepLine) ?? GENERIC_STEPS;
  return `${CALM_LINE}\n\n${steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}`;
}

export type EmergencyTurn = {
  text: string;
  step: "location" | "dispatch";
  sosType: EmergencyKind;
  hospitals: boolean;
};

/**
 * Steps a-b-c-d in one message: opening, then either the single location question or the
 * dispatch line (SOS first, hospitals next). Nothing else.
 */
export function emergencyTurn(
  assessment: SafetyAssessment,
  ctx: { hasLocation: boolean; place?: string | null },
): EmergencyTurn {
  const opening = emergencyOpening(assessment.incident);
  const hospitals = contactsHospitals(assessment);
  const sosType = assessment.kind;
  if (!ctx.hasLocation && assessment.reason === "sticky") {
    // The question was already asked and answered with a place we cannot map: never ask it again.
    return {
      text: "I could not find that place on my map, so I cannot pick hospitals for you automatically. Starting SOS to alert your emergency contacts now. Tell them exactly where you are.",
      step: "dispatch",
      sosType,
      hospitals: false,
    };
  }
  if (!ctx.hasLocation) {
    return {
      text: `${opening}\n\n${LOCATION_ASK}\n\n::suggest[Share my location]`,
      step: "location",
      sosType,
      hospitals,
    };
  }
  const where = ctx.place ? ` (${ctx.place})` : "";
  const next = hospitals
    ? "Starting SOS to alert your emergency contacts, then contacting the nearest hospitals."
    : "Starting SOS to alert your emergency contacts and safety network.";
  const ask = assessment.incident ? "" : "\n\nWhat happened?\n\n::suggest[Accident | Fire | Someone attacked me]";
  return { text: `${opening}\n\nI have your location${where}. ${next}${ask}`, step: "dispatch", sosType, hospitals };
}

// ── Session memory ───────────────────────────────────────────────────────────

export type SessionFacts = {
  town: string | null;
  name: string | null;
  whatHappened: string | null;
  sharedLocation: boolean;
};

const NAME_RE = /\b(?:my name is|i am called|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/;

/** What the user already told us in this conversation, newest answer first. */
export function sessionFacts(userTexts: string[], opts: { hasCoords?: boolean } = {}): SessionFacts {
  let town: string | null = null;
  let name: string | null = null;
  let whatHappened: string | null = null;
  let sharedLocation = Boolean(opts.hasCoords);
  for (const text of [...userTexts].reverse()) {
    if (!town) town = resolveUgandaPlace(text)?.name ?? null;
    if (!name) name = NAME_RE.exec(text)?.[1] ?? null;
    if (!whatHappened) {
      const happened = emergencyIncident(text) ?? (PERSONAL_OR_PRESENT.test(text) ? matchIncident(text) : null);
      if (happened) whatHappened = text.replace(/\s+/g, " ").trim().slice(0, 160);
    }
    if (/-?\d{1,2}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/.test(text)) sharedLocation = true;
  }
  return { town, name, whatHappened, sharedLocation };
}

/** Prompt lines that stop the model re-asking something the user already answered. */
export function factsPromptBlock(facts: SessionFacts) {
  const known = [
    facts.town ? `town/place: ${facts.town}` : null,
    facts.sharedLocation ? "GPS location: already shared" : null,
    facts.name ? `name: ${facts.name}` : null,
    facts.whatHappened ? `what happened: "${facts.whatHappened}"` : null,
  ].filter(Boolean);
  if (!known.length) return "";
  return `\n\nALREADY ANSWERED IN THIS CHAT (never ask again, and use automatically in emails, calls and searches):\n- ${known.join("\n- ")}`;
}

// ── Prompt blocks per level ──────────────────────────────────────────────────

const ONE_QUESTION_RULE =
  "- Ask at most ONE question, and only if you truly need the answer. Never repeat a question the user already answered.\n- Offer at most 3 short chips (::suggest[a | b | c]), all about the current step only.";

export function priorityPromptBlock(level: SafetyLevel): string {
  if (level === "emergency") {
    return `\n\nPRIORITY ORDER — EMERGENCY (overrides everything else):
- Open with "${CALM_LINE}" then at most 3 first-aid steps. No long explanations.
- Then one step at a time: location, SOS, nearby hospitals, status. Do not offer booking, appointments, email drafts, reporting menus or any marketing.
${ONE_QUESTION_RULE}
- Chips must be about this emergency only (for example: Share my location, Yes/No answers to your one question).`;
  }
  if (level === "urgent") {
    return `\n\nPRIORITY ORDER — URGENT HEALTH (not life-threatening):
- 1) Short practical advice first. 2) Then the nearest clinics (use the facility search once you know where the user is; ask the town only if it is unknown). 3) Then offer "Book appointment" or "Call clinic".
- Do not open the SOS or reporting flows unless the user says it is an emergency.
${ONE_QUESTION_RULE}`;
  }
  return `\n\nPRIORITY ORDER — NORMAL:
- Answer the question first. Then show at most ONE relevant action card (booking card, email draft card, nearby places...) — never several different cards.
${ONE_QUESTION_RULE}`;
}

// ── Chips ────────────────────────────────────────────────────────────────────

export const MAX_CHIPS = 3;

const OFF_TOPIC_IN_EMERGENCY =
  /\b(book(ing)?|appointment|report a|report crime|missing person|lost|found property|find help nearby|emergency numbers|first aid|menu|subscribe|upgrade|premium|learn more|download|invite|email|draft|write)\b/i;

/** Dedupe, drop what does not fit the level, and cap at three. */
export function limitChips(chips: string[], level: SafetyLevel | null | undefined, max = MAX_CHIPS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of chips) {
    const chip = raw.trim();
    const key = chip.toLowerCase();
    if (!chip || seen.has(key)) continue;
    if (level === "emergency" && OFF_TOPIC_IN_EMERGENCY.test(chip)) continue;
    seen.add(key);
    out.push(chip);
    if (out.length >= max) break;
  }
  return out;
}

// ── Plan part (what the client needs to lay the message out) ────────────────

export const SAFETY_PLAN_PART = "data-safety-plan" as const;

export type SafetyPlanData = {
  level: SafetyLevel;
  step: "location" | "dispatch" | "support" | "advice" | "answer";
  sosType?: EmergencyKind;
};

export function safetyPlanOf(parts: Array<{ type?: string; data?: unknown }> | undefined): SafetyPlanData | null {
  const part = (parts ?? []).find((p) => p?.type === SAFETY_PLAN_PART);
  const data = part?.data as Partial<SafetyPlanData> | undefined;
  if (!data || (data.level !== "emergency" && data.level !== "urgent" && data.level !== "normal")) return null;
  return {
    level: data.level,
    step: data.step ?? "answer",
    ...(data.sosType ? { sosType: data.sosType } : {}),
  };
}

/** User texts the SOS owner wrote: no other participant's messages, and not the latest question. */
export function ownerReportTexts<M extends { role: string; authorId?: string | null }>(
  messages: M[],
  ownerId: string | null,
  textOf: (message: M) => string,
): string[] {
  const users = messages.filter((m) => m.role === "user");
  const earlier = users.slice(0, -1);
  const owned = ownerId ? earlier.filter((m) => !m.authorId || m.authorId === ownerId) : earlier;
  return owned.map(textOf);
}
