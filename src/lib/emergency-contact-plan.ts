import { matchIncident, type Incident } from "@/lib/allma-emergency-playbook";
import {
  HEALTH_EMERGENCY_IDS as HEALTH_EMERGENCIES,
  HYPOTHETICAL,
  PERSONAL_OR_PRESENT,
  SEVERE_BLEEDING,
} from "@/lib/chat-priority";
import { isOfficialEmergencyNumber, normalizeInfobipPhone } from "@/lib/infobip.server";

export const EMERGENCY_COUNTDOWN_SECONDS = 10;
export const EMERGENCY_MAX_FACILITIES = 3;
/** Hard ceiling of emergency emails for one run, whatever the facility list says. */
export const EMERGENCY_EMAIL_CAP = 10;

// ── Is this a real emergency? ──────────────────────────────────────────────

export type RealEmergency = { incident: Incident; kind: "medical" | "crime" | "fire" };

/**
 * A first-hand report of something life-threatening. Questions about what to do in general,
 * and weak keyword hits, do not count — this decides whether Allma calls hospitals.
 */
export function classifyRealEmergency(text: string): RealEmergency | null {
  const t = text.trim();
  if (!t || HYPOTHETICAL.test(t)) return null;
  const incident = matchIncident(t);
  if (!incident || !incident.lifeThreatening || !HEALTH_EMERGENCIES.has(incident.id)) return null;
  if (!PERSONAL_OR_PRESENT.test(t)) return null;
  if (incident.id === "fire" && !/\b(fire|burning|explosion)\b/i.test(t)) return null;
  if (incident.id === "bleeding" && !SEVERE_BLEEDING.test(t)) return null;
  return { incident, kind: incident.marker };
}

// ── Facilities ─────────────────────────────────────────────────────────────

/** Uganda number as digits with country code (2567…/2564…); never a short emergency code. */
export function normalizeFacilityPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (isOfficialEmergencyNumber(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 10) digits = `256${digits.slice(1)}`;
  else if (digits.length === 9) digits = `256${digits}`;
  if (!/^256\d{9}$/.test(digits)) return null;
  if (isOfficialEmergencyNumber(digits)) return null;
  return normalizeInfobipPhone(digits);
}

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const JUNK_EMAIL =
  /(\.(png|jpe?g|gif|svg|webp|css|js|ico|woff2?)$)|(^|[._-])(no-?reply|donotreply|do-not-reply|mailer-daemon|postmaster|webmaster|abuse|privacy|unsubscribe)([._-]|@)|@(example|domain|email|yourdomain|yoursite|sentry|wixpress|sentry-next|godaddy)\.|^(user|name|your|email|test)@/i;
const USEFUL_LOCAL = /^(emergency|casualty|info|contact|enquiries|inquiries|reception|admin|hospital|clinic|office|hello|health)/i;

function hostOf(url: string | null | undefined) {
  try {
    return new URL(url ?? "").hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Real addresses published in a page's HTML, best candidate first. Nothing is guessed. */
export function extractPublishedEmails(html: string, websiteUrl?: string | null): string[] {
  const host = hostOf(websiteUrl);
  const text = html.replace(/%40/gi, "@").replace(/&#0*64;|&commat;/gi, "@");
  const found = new Set<string>();
  for (const match of text.matchAll(EMAIL_PATTERN)) {
    const address = match[0].replace(/^[._%+-]+/, "").toLowerCase();
    if (address.length > 120 || address.split("@")[0].length > 64) continue;
    if (JUNK_EMAIL.test(address)) continue;
    found.add(address);
  }
  const score = (address: string) => {
    const [local, domain] = address.split("@");
    let value = 0;
    if (host && (domain === host || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`))) value += 2;
    if (USEFUL_LOCAL.test(local)) value += 1;
    return value;
  };
  return [...found].sort((a, b) => score(b) - score(a));
}

export type FacilityCandidate = {
  id: string;
  name: string;
  type: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  distance_m: number;
  open_now: boolean | null;
  is_24h: boolean;
  latitude: number;
  longitude: number;
  source: "google" | "seeded";
};

export type EmergencyFacility = Omit<FacilityCandidate, "phone"> & { phone: string | null };

const HEALTH_FACILITY = /hospital|clinic|health|medical|doctor|dispensary|maternity|centre|center/i;
const NOT_HEALTH_FACILITY = /pharmacy|drug ?store|chemist|police|fire|dental|dentist|veterinar|laborator|lab\b|optical|salon/i;

export function isHealthFacility(candidate: Pick<FacilityCandidate, "name" | "type">) {
  const label = `${candidate.type} ${candidate.name}`;
  return HEALTH_FACILITY.test(label) && !NOT_HEALTH_FACILITY.test(label);
}

/**
 * Top facilities by distance that are not known to be closed and have at least one real way to
 * reach them (a callable Uganda number or a published email). Others are skipped.
 */
export function pickEmergencyFacilities(
  candidates: FacilityCandidate[],
  max = EMERGENCY_MAX_FACILITIES,
): EmergencyFacility[] {
  const seen = new Set<string>();
  const picked: EmergencyFacility[] = [];
  for (const candidate of [...candidates].sort((a, b) => a.distance_m - b.distance_m)) {
    if (!isHealthFacility(candidate)) continue;
    if (candidate.open_now === false && !candidate.is_24h) continue;
    const phone = normalizeFacilityPhone(candidate.phone);
    const email = candidate.email && !JUNK_EMAIL.test(candidate.email) ? candidate.email.toLowerCase() : null;
    if (!phone && !email) continue;
    const key = `${candidate.name.toLowerCase().replace(/\s+/g, " ")}|${phone ?? email}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push({ ...candidate, phone, email });
    if (picked.length >= max) break;
  }
  return picked;
}

// ── Messages (real data only, never placeholders) ──────────────────────────

export type EmergencyContext = {
  name: string | null;
  phone: string | null;
  /** "Road / boda boda accident" */
  incident: string;
  /** The user's own words about what happened. */
  situation: string | null;
  /** Town or area, e.g. "Jinja". */
  place: string | null;
  address: string | null;
  mapsLink: string;
};

export function mapsLinkFor(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export function mapsSearchLink(place: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place}, Uganda`)}`;
}

export function emergencySubject(ctx: Pick<EmergencyContext, "incident" | "place" | "name">) {
  const near = ctx.place ? ` near ${ctx.place}` : "";
  const who = ctx.name ? ` – ${ctx.name}` : "";
  return `EMERGENCY: ${ctx.incident}${near}${who}`.slice(0, 200);
}

function eatTime(now: Date) {
  const local = new Date(now.getTime() + 3 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)}/${local.getUTCFullYear()} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())} (East Africa Time)`;
}

export function emergencyEmailBody(
  ctx: EmergencyContext,
  input: { facilityName: string; now?: Date; sentFrom?: string | null },
) {
  const who = ctx.name ?? "A person";
  const lines = [
    `Dear ${input.facilityName} team,`,
    "",
    `This is an automatic EMERGENCY message from Allma Safety AI, sent on behalf of ${who}, who has asked for help from health facilities nearby.`,
    "",
    `Emergency: ${ctx.incident}`,
    ctx.situation ? `What happened: ${ctx.situation}` : null,
    ctx.name ? `Name: ${ctx.name}` : null,
    ctx.phone ? `Call back on: ${ctx.phone}` : null,
    ctx.address ? `Location: ${ctx.address}` : ctx.place ? `Location: near ${ctx.place}` : null,
    `Map: ${ctx.mapsLink}`,
    `Time: ${eatTime(input.now ?? new Date())}`,
    "",
    "Please respond or send help if you can. If the person cannot be reached by phone, treat this as urgent.",
    input.sentFrom ? `\nSent automatically from ${input.sentFrom} by Allma Safety AI.` : "\nSent automatically by Allma Safety AI.",
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}

function spokenDigits(phone: string) {
  return phone.replace(/\D/g, "").split("").join(" ");
}

/** Short spoken message. A URL cannot be read out, so the map link goes by email; the address is spoken. */
export function emergencyCallScript(ctx: EmergencyContext, opts: { mapsInEmail: boolean }) {
  const who = ctx.name ?? "A person";
  const where = ctx.address ?? (ctx.place ? `near ${ctx.place}, Uganda` : null);
  const parts = [
    `Emergency message from Allma Safety AI. ${who} needs urgent help.`,
    `Emergency: ${ctx.incident}.`,
    ctx.situation ? `${ctx.situation.slice(0, 140).replace(/[.!?]+$/, "")}.` : null,
    where ? `Location: ${where}.` : null,
    opts.mapsInEmail ? "The map link has been sent to your email." : null,
    ctx.phone ? `Call back on ${spokenDigits(ctx.phone)}.` : null,
  ].filter((part): part is string => Boolean(part));
  const once = parts.join(" ");
  return `${once} I repeat. ${once}`;
}

export function emailIsSystemFallbackError(error: string) {
  return ["gmail_not_connected", "reconnect_needed", "google_not_configured", "gmail_token_failed"].includes(error);
}
