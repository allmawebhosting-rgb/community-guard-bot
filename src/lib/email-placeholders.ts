const PLACEHOLDER_SOURCE = String.raw`\[[^\[\]\n]*[A-Za-z][^\[\]\n]*\]|\[\s*(?:\.{3}|…)\s*\]`;

/** Template leftovers such as "[Patient Name]" or "[...]" that must never be sent. */
export function findPlaceholders(text: string): string[] {
  return [...new Set(text.match(new RegExp(PLACEHOLDER_SOURCE, "g")) ?? [])];
}

export function hasPlaceholders(...texts: Array<string | null | undefined>): boolean {
  return texts.some((text) => Boolean(text) && new RegExp(PLACEHOLDER_SOURCE).test(text as string));
}

export type PlaceholderSegment = { text: string; placeholder: boolean };

export function splitPlaceholders(text: string): PlaceholderSegment[] {
  const segments: PlaceholderSegment[] = [];
  const matcher = new RegExp(PLACEHOLDER_SOURCE, "g");
  let last = 0;
  for (const match of text.matchAll(matcher)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ text: text.slice(last, index), placeholder: false });
    segments.push({ text: match[0], placeholder: true });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), placeholder: false });
  return segments;
}
