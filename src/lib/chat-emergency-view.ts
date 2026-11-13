// Pure helpers that decide what emergency UI an assistant reply shows.
// Kept out of the component so they can be unit-tested.
import { firstAidFor, matchIncident, type FirstAid, type Incident } from "@/lib/allma-emergency-playbook";

type LooseMessage = { role: string; parts?: Array<{ type: string; text?: string; output?: unknown }> };

/** Text of the closest user message before `index` (what this reply answers). */
export function userTextBefore(messages: LooseMessage[], index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    return (m.parts ?? [])
      .filter((p) => p.type === "text")
      .map((p) => String(p.text ?? ""))
      .join("\n");
  }
  return "";
}

/** The incident a reply is answering, or null for plain questions and facility searches. */
export function incidentForReply(messages: LooseMessage[], index: number): Incident | null {
  return matchIncident(userTextBefore(messages, index));
}

const NUMBERED_LIST = /^\s*\d+[.)]\s+\S/m;

/**
 * First-aid steps to show when the model skipped them (smaller models sometimes
 * call the places tool and never write the playbook). Null when the reply
 * already has numbered steps or the incident has no structured steps.
 */
export function firstAidFallback(incident: Incident | null, assistantText: string): FirstAid | null {
  if (!incident) return null;
  if (NUMBERED_LIST.test(assistantText)) return null;
  return firstAidFor(incident);
}

/** True when the reply text already carries the "isn't a doctor" line. */
export function hasNotDoctorLine(text: string): boolean {
  return /isn'?t a doctor|is not a doctor|not a doctor/i.test(text);
}

/** True when any find_facilities result in this message actually returned places. */
export function messageHasPlaces(parts: LooseMessage["parts"]): boolean {
  return (parts ?? []).some((p) => {
    if (p.type !== "tool-find_facilities") return false;
    const facilities = (p.output as { facilities?: unknown[] } | undefined)?.facilities;
    return Array.isArray(facilities) && facilities.length > 0;
  });
}

/** Map a retired location_intelligence tool result to FacilityResults cards. */
export type IntelFacility = {
  name: string;
  facility_type: string;
  type_label: string;
  phone: string | null;
  address: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_km?: number;
  open_now?: boolean;
};

function asFacility(raw: unknown, fallbackType: string, label: string): IntelFacility | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  const name = String(f.name ?? "").trim();
  if (!name) return null;
  const lat = Number(f.latitude ?? f.lat);
  const lng = Number(f.longitude ?? f.lng);
  const km = Number(f.distance_km);
  const phone = typeof f.phone === "string" && f.phone.trim() ? f.phone.trim() : null;
  const address = typeof f.address === "string" && f.address.trim() ? f.address.trim() : null;
  const district = typeof f.district === "string" && f.district.trim() ? f.district.trim() : null;
  return {
    name,
    facility_type: String(f.facility_type ?? fallbackType),
    type_label: label,
    phone,
    address: address ?? district,
    district,
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    ...(Number.isFinite(km) ? { distance_km: km } : {}),
    open_now: f.is_24_7 === true || f.open_now === true,
  };
}

/** Police, then hospital, then fire — the slots the old card used to show. */
export function facilitiesFromLocationIntel(output: Record<string, unknown> | null | undefined): IntelFacility[] {
  if (!output) return [];
  const slots: Array<[unknown, string, string]> = [
    [output.police_station, "police", "Police"],
    [output.hospital, "hospital", "Hospital"],
    [output.fire_station, "fire", "Fire & Rescue"],
  ];
  const out: IntelFacility[] = [];
  const seen = new Set<string>();
  for (const [raw, type, label] of slots) {
    const facility = asFacility(raw, type, label);
    if (!facility) continue;
    const key = facility.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(facility);
  }
  return out;
}

// Model narration that leaks into replies ("Let me arrange the local help details.").
const FILLER_SENTENCE =
  /(?:^|(?<=[.!?…]\s+))(?:(?:ok(?:ay)?|alright|now),?\s+)?(?:let me|i'?ll now|i will now)\s+(?:quickly\s+)?(?:arrange|gather|pull up|look up|find|search for|check|get|fetch|organi[sz]e|prepare)\b[^.!?:\n]{0,80}[.!…]+\s*/gi;

// Leftover prose from the retired Location Intelligence card / prompt.
const LOCATION_INTEL_LEAK =
  /(?:^|\n|(?<=[.!?…]\s+))\s*(?:Location Intelligence\s*[·•][^\n]+|This incident falls under [^\n.!?]+[.!?]?\s*|Responsible Station\s*)/gi;

/** Drop "Let me arrange the local help details."-style filler, leftover Location Intelligence lines, and a dangling "Now,". */
export function stripFillerSentences(text: string): string {
  if (!text) return text;
  let changed = false;
  const withoutIntel = text.replace(LOCATION_INTEL_LEAK, (match, offset, src: string) => {
    const atLineStart = offset === 0 || src[offset - 1] === "\n";
    return atLineStart ? "\n" : " ";
  });
  if (withoutIntel !== text) changed = true;
  const lines = withoutIntel.split("\n").map((line) => {
    const cleaned = line.replace(FILLER_SENTENCE, "");
    if (cleaned === line) return line;
    changed = true;
    return cleaned.replace(/^(\s*)Now,\s+(\S)/, (_m, sp: string, ch: string) => sp + ch.toUpperCase()).trimEnd();
  });
  return changed ? lines.join("\n").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim() : text;
}
