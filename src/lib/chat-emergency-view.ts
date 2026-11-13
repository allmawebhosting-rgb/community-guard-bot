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

// Model narration that leaks into replies ("Let me arrange the local help details.").
const FILLER_SENTENCE =
  /(?:^|(?<=[.!?…]\s+))(?:(?:ok(?:ay)?|alright|now),?\s+)?(?:let me|i'?ll now|i will now)\s+(?:quickly\s+)?(?:arrange|gather|pull up|look up|find|search for|check|get|fetch|organi[sz]e|prepare)\b[^.!?:\n]{0,80}[.!…]+\s*/gi;

/** Drop "Let me arrange the local help details."-style filler, plus a dangling "Now," it leaves behind. */
export function stripFillerSentences(text: string): string {
  if (!text) return text;
  let changed = false;
  const lines = text.split("\n").map((line) => {
    const cleaned = line.replace(FILLER_SENTENCE, "");
    if (cleaned === line) return line;
    changed = true;
    return cleaned.replace(/^(\s*)Now,\s+(\S)/, (_m, sp: string, ch: string) => sp + ch.toUpperCase()).trimEnd();
  });
  return changed ? lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() : text;
}
