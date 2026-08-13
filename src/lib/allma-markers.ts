// Inline UI markers the assistant writes directly in its reply text, so a turn
// costs ONE model request instead of extra tool round-trips for the chrome.
//
//   ::flow{type=reporting, step=1, total=4, title="What kind of incident?"}
//   ::suggest[Theft | Robbery | Assault | Something else]
//   ::media{type=photo, optional=true, tips="Good light · Whole scene"}

export type MarkerFlow = {
  label: string;
  step: number;
  total: number;
  title: string;
  helper: string | null;
};

export type MarkerMedia = {
  mediaType: string;
  prompt: string;
  tips: string | null;
  optional: boolean;
};

export type MarkerSuggestion = { label: string; prompt: string };

export type ParsedMarkers = {
  /** Reply text with every marker removed. */
  text: string;
  flow: MarkerFlow | null;
  suggestions: MarkerSuggestion[];
  media: MarkerMedia | null;
};

const FLOW_RE = /::flow\{([^}]*)\}/gi;
const MEDIA_RE = /::media\{([^}]*)\}/gi;
const SUGGEST_RE = /::suggest\[([^\]]*)\]/gi;

function parseAttrs(body: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-z_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^,}]*))/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    const key = match[1].toLowerCase();
    const value = (match[2] ?? match[3] ?? match[4] ?? "").trim();
    attrs[key] = value;
  }
  return attrs;
}

export function parseAllmaMarkers(raw: string): ParsedMarkers {
  let flow: MarkerFlow | null = null;
  let media: MarkerMedia | null = null;
  const suggestions: MarkerSuggestion[] = [];

  for (const match of raw.matchAll(FLOW_RE)) {
    const attrs = parseAttrs(match[1]);
    const label = (attrs.type || attrs.label || attrs.flow || "").trim();
    if (!label) continue;
    const step = Number(attrs.step) || 1;
    const total = Math.max(Number(attrs.total) || step, step);
    flow = {
      label,
      step,
      total,
      title: attrs.title || "",
      helper: attrs.helper ? attrs.helper : null,
    };
  }

  for (const match of raw.matchAll(MEDIA_RE)) {
    const attrs = parseAttrs(match[1]);
    const mediaType = (attrs.type || "photo").toLowerCase();
    media = {
      mediaType,
      prompt: attrs.prompt || "",
      tips: attrs.tips ? attrs.tips : null,
      optional: attrs.optional === "true",
    };
  }

  for (const match of raw.matchAll(SUGGEST_RE)) {
    for (const piece of match[1].split("|")) {
      const label = piece.trim();
      if (!label) continue;
      if (suggestions.some((s) => s.label === label)) continue;
      suggestions.push({ label: label.length > 26 ? `${label.slice(0, 25)}…` : label, prompt: label });
    }
  }

  const text = raw
    .replace(FLOW_RE, "")
    .replace(MEDIA_RE, "")
    .replace(SUGGEST_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, flow, suggestions: suggestions.slice(0, 5), media };
}

/** True when the text still contains a partially streamed marker. */
export function hasOpenMarker(raw: string): boolean {
  const tail = raw.slice(raw.lastIndexOf("::"));
  return /^::(f(l(o(w)?)?)?|s(u(g(g(e(s(t)?)?)?)?)?)?|m(e(d(i(a)?)?)?)?)(\{[^}]*|\[[^\]]*)?$/i.test(
    tail,
  );
}

export const ALLMA_MARKER_CONTRACT = `INLINE UI MARKERS — write these directly in your reply text (never as tool calls):
- Guided step banner: ::flow{type=Reporting, step=2, total=5, title="Where did it happen?"}  (put it on its own FIRST line; type is the flow name: Reporting, Missing person, Lost & found, Safety check, Find help, Advice)
- Tappable answers / next steps: ::suggest[Theft | Robbery | Assault | Something else]  (2-4 short options, on the LAST line, always the exact answers to what you just asked — never a generic menu)
- Ask for evidence: ::media{type=photo, optional=true, tips="Good light · Show the whole scene"}  (type: photo, video, audio, document or location)
Markers are stripped from the visible message and rendered as premium cards and chips. Use at most one ::flow, one ::media and one ::suggest per reply, and never mention or explain the markers.`;
