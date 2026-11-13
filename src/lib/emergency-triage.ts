// Situational emergency triage: decides how Allma reacts to an emergency message.
import { matchIncident, playbookPromptFor, type HelpType, type Incident } from "@/lib/allma-emergency-playbook";

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

/** Buttons for the ::emergency action block — one number per button. */
export const EMERGENCY_BLOCK_LINES: Record<"medical" | "crime" | "fire", Hotline[]> = {
  medical: [
    { label: "Police", number: "999" },
    { label: "Toll-free emergency", number: "112" },
    { label: "Ambulance", number: "911" },
  ],
  crime: [
    { label: "Police", number: "999" },
    { label: "Toll-free emergency", number: "112" },
  ],
  fire: [
    { label: "Police", number: "999" },
    { label: "Toll-free emergency", number: "112" },
  ],
};

export function classifyIncident(text: string): Incident | null {
  return matchIncident(text);
}

function kindOf(incident: Incident): Exclude<EmergencyKind, null> {
  if (incident.marker === "fire") return "fire";
  if (incident.marker === "crime") return "violence";
  return "medical";
}

export function classifyEmergency(text: string): EmergencyKind {
  const incident = matchIncident(text);
  return incident ? kindOf(incident) : null;
}

/** Facility types to search, in priority order. */
export function facilitiesFor(text: string): HelpType[] {
  return matchIncident(text)?.helpTypes ?? [];
}

export function facilityFor(kind: EmergencyKind): "hospital" | "police" | "fire" | null {
  return kind === "medical" ? "hospital" : kind === "violence" ? "police" : kind === "fire" ? "fire" : null;
}

export function emergencyPromptBlock(input: EmergencyKind | Incident | null, hasCoords: boolean): string {
  if (!input) return "";
  if (typeof input === "string") {
    const type = facilityFor(input);
    return `\n\nEMERGENCY DETECTED: ${input.toUpperCase()}. Do NOT open a flow or ask survey questions. Give short numbered steps, then call find_facilities with facility_type="${type}"${hasCoords ? " near their shared GPS location" : ""}. Never claim anyone was contacted.`;
  }
  return `\n\nEMERGENCY DETECTED — follow the playbook below. Do NOT open a ::flow, do NOT greet, do NOT ask survey questions. ${hasCoords ? "GPS is shared: use it unless the user named a town (a named town wins)." : "No GPS: if the user named a town, pass it as area; otherwise ask for location in one short line with ::media{type=location} after the steps."}\n\n${playbookPromptFor(input)}`;
}
