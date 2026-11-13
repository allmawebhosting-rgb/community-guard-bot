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

export type MarkerEmergency = { type: "medical" | "crime" | "fire" };

export type ParsedMarkers = {
  /** Reply text with every marker removed. */
  text: string;
  /** Emergency action block (SOS + call buttons) to show at the top. */
  emergency: MarkerEmergency | null;
  flow: MarkerFlow | null;
  suggestions: MarkerSuggestion[];
  media: MarkerMedia | null;
};

const FLOW_RE = /::flow\{([^}]*)\}/gi;
const MEDIA_RE = /::media\{([^}]*)\}/gi;
const SUGGEST_RE = /::suggest\[([^\]]*)\]/gi;
const EMERGENCY_RE = /::emergency(?:\{([^}]*)\})?/gi;

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

const INLINE_CHOICE_RE = /\[([A-Z][A-Z' ]{0,20}(?:\s*[/|]\s*[A-Z][A-Z' ]{0,20})+)\]/g;

/**
 * Repairs common model formatting slips so markdown renders cleanly:
 * inline bullets get their own lines, glued words are spaced, and each
 * emergency number sits on its own line.
 */
export function normalizeChatMarkdown(input: string): string {
  // "yourAI-powered" → "your AI-powered"
  // 911 is not a Ugandan number: never show it.
  // An "Ambulance 911" becomes the toll-free 112; any other 911 becomes Police 999.
  const spaced = input
    .replace(/([a-z])(AI\b)/g, "$1 $2")
    .replace(/(ambulance\W{0,3})911(?![\d.,]\d)/gi, "$1112")
    .replace(/(?<![\d.,])911(?![\d.,]\d)/g, "999");
  const out: string[] = [];
  // Emoji capability lists glued into one paragraph → one item per line.
  const EMOJI = /\p{Extended_Pictographic}/u;
  const lines0 = spaced.split("\n").flatMap((l) => {
    const hits = l.match(/\p{Extended_Pictographic}/gu) ?? [];
    if (hits.length >= 3 && !/^\s*-\s/.test(l)) {
      const parts = l.split(/\s+(?=\p{Extended_Pictographic})/u).map((x) => x.trim()).filter(Boolean);
      const lead = EMOJI.test(parts[0]?.slice(0, 2) ?? "") ? [] : [parts.shift()!];
      return [...lead, "", ...parts.map((x) => `- ${x}`), ""];
    }
    return [l];
  });
  // Consecutive emoji-led lines are a list.
  for (let i = 0; i < lines0.length; i++) {
    const cur = lines0[i];
    const emojiLed = (x?: string) => Boolean(x && /^\s*\p{Extended_Pictographic}/u.test(x) && x.length < 70);
    if (emojiLed(cur) && (emojiLed(lines0[i - 1]) || emojiLed(lines0[i + 1]))) lines0[i] = `- ${cur.trim()}`;
  }
  for (const rawLine of lines0) {
    let line = rawLine.replace(/\s+[•●▪]\s+/g, " - ");
    // "Police 999 Toll-free 112" → separated so each number gets its own line.
    line = line.replace(/\b(999|112|0800[\s-]?\d{3}[\s-]?\d{3})\b\s+(?=[A-Z][a-z]|\p{Extended_Pictographic})/gu, "$1, ");
    const numbers = line.match(/\b(?:999|112|0800[\s-]?\d{3}[\s-]?\d{3})\b/g) ?? [];
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (numbers.length >= 2 && bullet) {
      // A list item holding two numbers ("- 📞 0800 199 699 📞 Or call 999") → one item each.
      const items = bullet[2]
        .split(/\s*[,;·|]\s*|\s+\/\s+(?=\d)/)
        .map((p) => p.trim())
        .filter((p) => p && !/^\p{Extended_Pictographic}+$/u.test(p));
      if (items.length >= 2) {
        out.push(...items.map((p) => `${bullet[1]}- ${p.replace(/[.]$/, "")}`));
        continue;
      }
    }
    if (numbers.length >= 2 && !/^\s*[-*\d]/.test(line)) {
      // One emergency number per line.
      const parts = line
        .split(/\s*[,;·|]\s*|\s+(?:and|or)\s+(?=[A-Z])|\s+\/\s+(?=\d)/)
        .map((p) => p.trim())
        .filter(Boolean)
        .filter((p) => !/^\p{Extended_Pictographic}+$/u.test(p));
      if (parts.length >= 2) {
        const colon = /^([^:\d]{1,40}):\s*(.+)$/.exec(parts[0]);
        if (colon) parts.splice(0, 1, `${colon[1]}:`, colon[2]);
        const lead = /\d/.test(parts[0]) ? null : parts.shift()!;
        if (lead) out.push(lead);
        out.push("", ...parts.map((p) => `- ${p.replace(/[.]$/, "")}`), "");
        continue;
      }
    }
    // Inline bullets: "Intro: - one - two" → list.
    const inline = line.split(/\s+-\s+(?=[A-Z*])/);
    if (inline.length >= 2 && !/^\s*-\s/.test(line)) {
      const [head, ...items] = inline;
      out.push(head.trim(), "", ...items.map((i) => `- ${i.trim()}`), "");
      continue;
    }
    if (inline.length >= 2) {
      out.push(...inline.map((i, n) => (n === 0 ? i : `- ${i.trim()}`)));
      continue;
    }
    // Numbered steps glued after a sentence.
    line = line.replace(/([.!?])\s+(\d{1,2})\.\s+(?=[A-Z*])/g, "$1\n$2. ");
    out.push(line);
  }
  // Lists need a blank line before them (and none between items) to render tightly.
  const lines = out;
  const fixed: string[] = [];
  const isItem = (l: string) => /^\s*(?:- |\d+\. )/.test(l);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l === "" && isItem(lines[i + 1] ?? "") && isItem(fixed[fixed.length - 1] ?? "")) continue;
    if (isItem(l) && fixed.length && fixed[fixed.length - 1] !== "" && !isItem(fixed[fixed.length - 1])) fixed.push("");
    fixed.push(l);
  }
  return fixed.join("\n");
}

function lineKey(line: string): string {
  return line
    .toLowerCase()
    .replace(/^\s*(?:[-*]|\d+[.)])\s*/, "")
    .replace(/[*_`#>]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * When a model writes its steps before a tool call and then repeats them after
 * the results, the second copy is dropped so each block shows once.
 * Lines (≥ 12 chars) already shown in an earlier text part are removed.
 */
export function dedupeRepeatedParts(texts: string[]): string[] {
  const seen = new Set<string>();
  return texts.map((text) => {
    const kept: string[] = [];
    const added: string[] = [];
    for (const line of text.split("\n")) {
      const key = lineKey(line);
      if (key.length >= 12 && seen.has(key)) continue;
      if (key.length >= 12) added.push(key);
      kept.push(line);
    }
    for (const k of added) seen.add(k);
    // Drop headings left without their (removed) list, e.g. a lone "Get help now if:".
    const cleaned = kept.filter((line, i) => {
      if (!/:\**\s*$/.test(line.trim()) || line.trim().length > 60) return true;
      const next = kept.slice(i + 1).find((l) => l.trim() !== "");
      return Boolean(next && /^\s*(?:[-*]|\d+[.)])\s/.test(next));
    });
    return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  });
}

export function parseAllmaMarkers(raw: string): ParsedMarkers {
  let flow: MarkerFlow | null = null;
  let emergency: MarkerEmergency | null = null;
  for (const match of raw.matchAll(EMERGENCY_RE)) {
    const t = (parseAttrs(match[1] ?? "").type || "medical").toLowerCase();
    emergency = { type: /crime|violence|police|danger/.test(t) ? "crime" : /fire|gas|collapse/.test(t) ? "fire" : "medical" };
  }
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
    for (const piece of match[1].split(/\s*\|\s*|\s+\/\s+/)) {
      const label = piece.trim();
      if (!label) continue;
      if (suggestions.some((s) => s.label === label)) continue;
      suggestions.push({ label, prompt: label });
    }
  }

  let text = raw
    .replace(EMERGENCY_RE, "")
    .replace(FLOW_RE, "")
    .replace(MEDIA_RE, "")
    .replace(SUGGEST_RE, "");

  // Inline choice brackets like "[YES / SKIP]" become real buttons.
  const inlineChoices: MarkerSuggestion[] = [];
  text = text.replace(INLINE_CHOICE_RE, (_m, body: string) => {
    for (const piece of body.split(/\s*[/|]\s*/)) {
      const label = piece.trim();
      if (!label) continue;
      const pretty = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
      inlineChoices.push({ label: pretty, prompt: pretty });
    }
    return "";
  });
  if (inlineChoices.length) {
    const rest = suggestions.filter(
      (s) => !inlineChoices.some((c) => c.label.toLowerCase() === s.label.toLowerCase()),
    );
    suggestions.splice(0, suggestions.length, ...inlineChoices, ...rest);
  }

  text = normalizeChatMarkdown(text).replace(/\n{3,}/g, "\n\n").trim();

  return { text, emergency, flow, suggestions: suggestions.slice(0, 5), media };
}

/** True when the text still contains a partially streamed marker. */
export function hasOpenMarker(raw: string): boolean {
  const tail = raw.slice(raw.lastIndexOf("::"));
  return /^::(e(m(e(r(g(e(n(c(y)?)?)?)?)?)?)?)?|f(l(o(w)?)?)?|s(u(g(g(e(s(t)?)?)?)?)?)?|m(e(d(i(a)?)?)?)?)(\{[^}]*|\[[^\]]*)?$/i.test(
    tail,
  );
}

export const ALLMA_MARKER_CONTRACT = `INLINE UI MARKERS — write these directly in your reply text (never as tool calls):
- Guided step banner: ::flow{type=Reporting, step=2, total=5, title="Where did it happen?"}  (put it on its own FIRST line; type is the flow name: Reporting, Missing person, Lost & found, Safety check, Find help, Advice)
- Tappable answers / next steps: ::suggest[Theft | Robbery | Assault | Something else]  (2-4 short options, on the LAST line, always the exact answers to what you just asked — never a generic menu)
- Emergency action block: ::emergency{type=medical}  (type: medical, crime or fire; own FIRST line, only for potentially life-threatening situations; renders a red Press SOS button plus separate Call 999 (Police) / Call 112 (Toll-free) buttons — the user taps them, nothing starts automatically)
- Ask for evidence: ::media{type=photo, optional=true, tips="Good light · Show the whole scene"}  (type: photo, video, audio, document or location)
Markers are stripped from the visible message and rendered as premium cards and chips. Use at most one ::emergency, one ::flow, one ::media and one ::suggest per reply, and never mention or explain the markers.`;
