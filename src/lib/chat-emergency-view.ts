// Pure helpers that decide what emergency UI an assistant reply shows.
// Kept out of the component so they can be unit-tested.
import { toFiniteNumber, validLatLng } from "@/lib/facility-distance";
import { firstAidFor, matchIncident, type FirstAid, type Incident } from "@/lib/allma-emergency-playbook";

type LooseMessage = { role: string; parts?: Array<{ type: string; text?: string; output?: unknown }> };

const NON_USER_FACING_TOOL_NAMES = new Set(["suggest_replies", "physical_firstaid"]);

/** Hide internal/model-only tool calls that have no meaningful user-facing card. */
export function shouldRenderToolCard(type: string): boolean {
  const name = type.replace(/^tool-/i, "").toLowerCase();
  return !NON_USER_FACING_TOOL_NAMES.has(name);
}

/**
 * Hide empty / premature tool cards that made chat look broken
 * (REPORT SUMMARY · Done, NEARBY HELP · No active alerts, etc.).
 */
export function shouldShowToolOutput(
  type: string,
  output: Record<string, unknown> | null | undefined,
): boolean {
  const name = type.replace(/^tool-/i, "").toLowerCase();
  if (!shouldRenderToolCard(name)) return false;
  if (name === "report_summary") {
    return Boolean(output?.ok && String(output.title ?? "").trim() && String(output.summary ?? "").trim());
  }
  if (name === "create_report") {
    return Boolean(output?.ok && (output.reference || output.title));
  }
  if (name === "list_alerts") {
    return Array.isArray(output?.alerts) && output.alerts.length > 0;
  }
  if (name === "find_facilities" || name === "search_safety_resources") {
    // Empty facility results still show the share-location recovery card.
    return true;
  }
  if (name === "prepare_emergency_dispatch") {
    return Boolean(output?.official_number || output?.spoken_script);
  }
  if (name === "send_incident_email" || name === "send_email") {
    return Boolean(output && (output.timestamp || output.to || output.error));
  }
  if (name === "my_reports" || name === "match_reports") {
    const rows = (output?.reports ?? output?.matches) as unknown[] | undefined;
    return Array.isArray(rows); // empty list is a valid "nothing found" state for reports
  }
  if (name === "recommend_actions") {
    return Array.isArray(output?.actions) && output.actions.length > 0;
  }
  if (name === "book_hospital_appointment") {
    return Boolean(output && (output.summary || output.hospital || output.status));
  }
  if (name === "case_timeline") {
    return Boolean(
      output?.ok &&
        Array.isArray(output.events) &&
        output.events.some(
          (event) =>
            event &&
            typeof event === "object" &&
            typeof (event as { label?: unknown }).label === "string" &&
            String((event as { label?: unknown }).label).trim().length > 0,
        ),
    );
  }
  return true;
}

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

const SHORT_INJURY_ANSWER =
  /^(yes|no|y|n|yeah|yep|nope|leg|arm|head|hand|foot|chest|back|neck|stomach|it hurts|hurts|bleeding|deep|shallow)[.!]?$/i;

/** The incident a reply is answering, or null for plain questions and facility searches. */
export function incidentForReply(messages: LooseMessage[], index: number): Incident | null {
  const latest = userTextBefore(messages, index);
  const direct = matchIncident(latest);
  if (direct) return direct;
  // Short yes/no answers mid-injury chat: use the earlier medical cue in the thread.
  if (!SHORT_INJURY_ANSWER.test(latest.trim())) return null;
  for (let i = index - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    const text = (m.parts ?? [])
      .filter((p) => p.type === "text")
      .map((p) => String(p.text ?? ""))
      .join("\n");
    if (SHORT_INJURY_ANSWER.test(text.trim())) continue;
    const hit = matchIncident(text);
    if (hit) return hit;
  }
  return null;
}

const NUMBERED_LIST = /^\s*\d+[.)]\s+\S/m;
const GET_HELP_BLOCK =
  /(?:^|\n)\s*(?:\*\*)?(?:Get help now if|Seek (?:medical )?help if|Red flags?)(?:\s*\*\*)?\s*:?\s*(?:\*\*)?\s*\n(?:\s*[-*•].+\n?)+/gi;
const NOT_DOCTOR_LINE_RE =
  /(?:^|\n)\s*Allma isn'?t a doctor[^\n]*\n?/gi;
const EMERGENCY_NUMBERS_BLOCK =
  /(?:^|\n)\s*Here are Uganda'?s emergency numbers:[\s\S]*?(?=\n\s*::|\n*$)/gi;
const DO_THIS_NOW_BLOCK =
  /(?:^|\n)\s*(?:\*\*)?(?:Do this now|First[- ]aid|Immediate steps)(?:\s*\*\*)?\s*:?\s*(?:\*\*)?\s*\n(?:\s*\d+[.)].+\n?)+/gi;

/**
 * Canonical first-aid card for a matched incident. Prefer this card over free-form
 * model steps so the SOS block and steps stay in a fixed order.
 */
export function preferredFirstAid(incident: Incident | null): FirstAid | null {
  if (!incident) return null;
  return firstAidFor(incident);
}

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

/**
 * When the playbook card is on screen, drop duplicate first-aid prose / number
 * dumps from the model text so the reply does not jump or double up.
 */
export function stripDuplicateFirstAidProse(text: string, incident: Incident | null): string {
  if (!text || !incident || !firstAidFor(incident)) return text;
  let out = text;
  out = out.replace(DO_THIS_NOW_BLOCK, "\n");
  // Whole numbered lists (model restating the playbook).
  out = out.replace(/(?:^|\n)(?:\s*\d+[.)]\s+.+\n?)+/gm, "\n");
  out = out.replace(GET_HELP_BLOCK, "\n");
  out = out.replace(NOT_DOCTOR_LINE_RE, "\n");
  out = out.replace(EMERGENCY_NUMBERS_BLOCK, "\n");
  if (incident.followUp) {
    const q = incident.followUp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?:^|\\n)\\s*${q}\\s*`, "i"), "\n");
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
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
  const point = validLatLng(f.latitude ?? f.lat, f.longitude ?? f.lng);
  const km = toFiniteNumber(f.distance_km);
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
    latitude: point ? point.lat : null,
    longitude: point ? point.lng : null,
    ...(km !== null && km > 0 ? { distance_km: km } : {}),
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

// Model talking about tools / UI chrome instead of calling them.
const TOOL_PROSE_LEAK =
  /(?:^|(?<=[.!?…]\s+))(?:please note that |note that )?(?:the )?emergency block has been activated[^.!?\n]*[.!?]?\s*|using the find_facilities function[^.!?\n]*[.!?]?\s*|(?:call|use|using) (?:the )?find_facilities(?: function)?[^.!?\n]*[.!?]?\s*|::find_facilities\{[^}]*\}\s*/gi;

/** Drop "Let me arrange the local help details."-style filler, leftover Location Intelligence lines, and a dangling "Now,". */
export function stripFillerSentences(text: string): string {
  if (!text) return text;
  let changed = false;
  const withoutIntel = text.replace(LOCATION_INTEL_LEAK, (match, offset, src: string) => {
    const atLineStart = offset === 0 || src[offset - 1] === "\n";
    return atLineStart ? "\n" : " ";
  });
  if (withoutIntel !== text) changed = true;
  const withoutTools = withoutIntel.replace(TOOL_PROSE_LEAK, () => {
    changed = true;
    return "";
  });
  const lines = withoutTools.split("\n").map((line) => {
    const cleaned = line.replace(FILLER_SENTENCE, "");
    if (cleaned === line) return line;
    changed = true;
    return cleaned.replace(/^(\s*)Now,\s+(\S)/, (_m, sp: string, ch: string) => sp + ch.toUpperCase()).trimEnd();
  });
  return changed ? lines.join("\n").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim() : text;
}
