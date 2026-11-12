// Situational emergency triage: decides how Allma reacts to an emergency message.
export type EmergencyKind = "medical" | "violence" | "fire" | null;

export type Hotline = { label: string; number: string };

export const UGANDA_HOTLINES: Record<Exclude<EmergencyKind, null>, Hotline[]> = {
  medical: [
    { label: "Ambulance", number: "911" },
    { label: "Toll-free emergency", number: "112" },
  ],
  violence: [
    { label: "Police", number: "999" },
    { label: "Toll-free emergency", number: "112" },
  ],
  fire: [
    { label: "Fire & Rescue", number: "112" },
    { label: "Police", number: "999" },
  ],
};

const PATTERNS: Array<{ kind: Exclude<EmergencyKind, null>; re: RegExp }> = [
  { kind: "fire", re: /\bfire\b|burning|smoke|gas leak|explosion|building (collapse|fell)|collapsed/i },
  { kind: "violence", re: /attack|being followed|kidnap|abduct|rape|defile|gun|knife|stab|shoot|beating me|beat(en)? me|threaten|break(ing)? in|intruder|robbing me|mob/i },
  { kind: "medical", re: /bleed|unconscious|not breathing|can'?t breathe|chok|heart attack|chest pain|stroke|seizure|convuls|faint|collaps|snake ?bite|poison|overdose|labou?r|pregnan.*(pain|bleed)|accident|crash|injur|broken (leg|arm|bone)|burn(ed|t)|fever|vomit|sick|medical/i },
];

export function classifyEmergency(text: string): EmergencyKind {
  for (const p of PATTERNS) if (p.re.test(text)) return p.kind;
  return null;
}

export function facilityFor(kind: EmergencyKind): "hospital" | "police" | "fire" | null {
  return kind === "medical" ? "hospital" : kind === "violence" ? "police" : kind === "fire" ? "fire" : null;
}

export function emergencyPromptBlock(kind: EmergencyKind, hasCoords: boolean): string {
  if (!kind) return "";
  const facility = facilityFor(kind);
  const lines = UGANDA_HOTLINES[kind].map((h) => `${h.label} ${h.number}`).join(", ");
  const firstStep = {
    medical: "Give 1-3 short numbered first-aid steps for exactly this situation (e.g. press firmly on bleeding, recovery position if unconscious and breathing, start CPR if not breathing).",
    violence: "First tell them how to get safe right now in one or two short lines (move to a lit public place, lock the door, stay quiet, keep the phone on silent). Remind them they can press the red SOS button to alert their Safety Circle.",
    fire: "First give the evacuation instruction in one or two short lines (get out now, stay low under smoke, do not use lifts, do not go back inside, keep away from gas).",
  }[kind];
  return `\n\nEMERGENCY DETECTED: ${kind.toUpperCase()}. Do NOT open a flow, do NOT ask survey questions, do NOT greet. ${firstStep} Then IMMEDIATELY call find_facilities with facility_type="${facility}"${hasCoords ? " near their shared GPS location" : " (if no area is known, ask only for their location in one short line after the steps)"}. Mention the nearest place by name and distance and that they can tap it for directions. Uganda emergency lines: ${lines} — say these numbers. Never claim you have contacted police, ambulance or anyone, and never say help is coming.`;
}
