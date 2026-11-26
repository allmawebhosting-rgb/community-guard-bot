/**
 * Decides when a chat message needs live internet information (news, opening hours, advisories,
 * external facts). Emergencies, nearby-help, booking, email and reporting have their own paths
 * and never go to web search.
 */

const EXPLICIT = /\b(google|search (the )?(web|internet|online)|search (for|up)|look(?:ing)? (it |this |that )?up|look up|check online|find out|on the internet)\b/i;

const REALTIME =
  /\b(latest|breaking|news|headlines?|today'?s|tonight|this (week|weekend|month)|right now|currently|current|recent(ly)?|update[sd]?|what'?s happening|just happened)\b/i;

const FACTS =
  /\b(opening hours|opening times|working hours|visiting hours|open (now|today|on (sunday|monday|tuesday|wednesday|thursday|friday|saturday))|closing time|what time (does|do|is)|is .{2,60} open|official (advisory|statement|guidance|announcement)|travel advis(ory|ories)|health advis(ory|ories)|outbreak|vaccination (schedule|requirements?)|weather|forecast|exchange rate|price of|how much (is|does|do)|who is the|when (is|was|does|did)|where (can i|do i) (get|find|buy|apply|register)|requirements? (for|to)|how (do|can) i (apply|register|renew|get a))\b/i;

const NOT_SEARCH =
  /\b(nearest|nearby|near me|closest|around me)\b|\b(book|appointment)\b|\b(write|draft|compose|send)\b.{0,30}\be-?mail\b|\b(sos|i need help|help me|someone (is|was)|bleeding|unconscious|not breathing|choking|overdose|attack(ed)?|assault|robbed|kidnap|on fire|accident|report (a|an|the)|file a report|first aid)\b/i;

export function wantsWebSearch(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 6 || t.length > 400) return false;
  if (NOT_SEARCH.test(t)) return false;
  return EXPLICIT.test(t) || REALTIME.test(t) || FACTS.test(t);
}

const LEAD_IN =
  /^(?:(?:please|pls|can you|could you|would you|will you|kindly|hey|hi|allma)[ ,]+)*(?:(?:go )?(?:and )?(?:search|google|look up|look for|find out|check)(?: (?:google|the web|the internet|online))?(?: for| about| up)?[ :,]+)/i;

/** Turns a chat message into a compact search query. */
export function buildSearchQuery(text: string): string {
  let q = text.replace(/\s+/g, " ").trim();
  q = q.replace(LEAD_IN, "");
  q = q.replace(/\b(on google|on the web|on the internet|online)\b[ ?.!]*$/i, "");
  q = q.replace(/[?!.]+$/g, "").trim();
  return (q || text.trim()).slice(0, 200);
}

export type WebSearchToolOutput = {
  ok?: boolean;
  answer?: string | null;
  results?: Array<{ title?: string; snippet?: string; source?: string }>;
};

/** Plain reply used when the model returns no words after a search. */
export function searchFallbackText(output: WebSearchToolOutput | null): string {
  if (!output || output.ok === false) {
    return "I could not reach live search just now, so I will not guess. Please try again in a moment, or check the official source directly for anything time-sensitive.";
  }
  const lead = output.answer?.trim();
  const lines = (output.results ?? [])
    .filter((item) => item.snippet?.trim())
    .slice(0, 2)
    .map((item) => `According to ${item.source || "one source"}: ${item.snippet!.trim()}`);
  if (lead) return [lead, ...lines.slice(0, 1)].join(" ");
  if (lines.length) return lines.join(" ");
  return "I searched but did not find anything reliable on that. Try rephrasing, or check the official source directly.";
}
