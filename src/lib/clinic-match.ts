const GENERIC = new Set([
  "hospital", "clinic", "clinics", "medical", "medicine", "centre", "center", "health", "healthcare",
  "doctor", "doctors", "chamber", "chambers", "dental", "dentist", "care", "the", "and", "of", "at",
  "in", "for", "uganda", "kampala", "road", "rd", "st", "ltd", "limited", "services", "service",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function distinctive(text: string): string[] {
  return [...new Set(tokens(text).filter((token) => token.length > 1 && !GENERIC.has(token)))];
}

/** True when a directory result is plausibly the clinic the user named, not just a similar-sounding one. */
export function isSameClinic(requested: string, candidate: string): boolean {
  const wanted = distinctive(requested);
  if (!wanted.length) return false;
  const found = new Set(distinctive(candidate));
  const hits = wanted.filter((token) => found.has(token) || [...found].some((f) => f.startsWith(token) || token.startsWith(f)));
  return hits.length >= Math.ceil(wanted.length / 2);
}

/** First result that really is the requested clinic; never falls back to an unrelated first hit. */
export function pickRequestedClinic<T extends { name: string }>(requested: string, places: T[]): T | null {
  return places.find((place) => isSameClinic(requested, place.name)) ?? null;
}
