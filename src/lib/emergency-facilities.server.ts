import { resolveGoogleMapsKey } from "@/lib/places.server";
import {
  extractPublishedEmails,
  isHealthFacility,
  pickEmergencyFacilities,
  type EmergencyFacility,
  type FacilityCandidate,
} from "@/lib/emergency-contact-plan";

const GOOGLE_API_URL = "https://places.googleapis.com/v1";
const SEARCH_RADIUS_M = 15_000;
const DETAIL_CANDIDATES = 8;
const DETAIL_TIMEOUT_MS = 3_000;
const SITE_TIMEOUT_MS = 3_500;
const MAX_PAGE_BYTES = 400_000;

function googleKey(): string | null {
  return (
    resolveGoogleMapsKey({
      ...(import.meta.env as Record<string, string | undefined>),
      ...process.env,
    }) ?? null
  );
}

type PlaceDetails = {
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  formattedAddress?: string;
  currentOpeningHours?: { openNow?: boolean };
  regularOpeningHours?: { periods?: Array<{ open?: { hour?: number; day?: number }; close?: unknown }> };
};

const DETAIL_FIELDS =
  "nationalPhoneNumber,internationalPhoneNumber,websiteUri,formattedAddress,currentOpeningHours.openNow,regularOpeningHours.periods";

function opensAroundTheClock(details: PlaceDetails) {
  const periods = details.regularOpeningHours?.periods ?? [];
  return periods.length === 1 && periods[0]?.open?.hour === 0 && !periods[0]?.close;
}

async function fetchPlaceDetails(placeId: string, key: string): Promise<PlaceDetails | null> {
  try {
    const res = await fetch(`${GOOGLE_API_URL}/places/${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": key,
        Referer: "https://allmasafetyai.online/",
        "X-Goog-FieldMask": DETAIL_FIELDS,
      },
      signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
    });
    return res.ok ? ((await res.json()) as PlaceDetails) : null;
  } catch {
    return null;
  }
}

/** Public http(s) sites only, so a listing can never point this fetch at an internal address. */
export function isPublicWebsite(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    if (!host.includes(".") || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return false;
    return true;
  } catch {
    return false;
  }
}

async function readPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AllmaSafetyBot/1.0 (+https://allmasafetyai.online)", Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(SITE_TIMEOUT_MS),
    });
    if (!res.ok) return "";
    const type = res.headers.get("content-type") ?? "";
    if (type && !/text\/html|text\/plain|xhtml/i.test(type)) return "";
    return (await res.text()).slice(0, MAX_PAGE_BYTES);
  } catch {
    return "";
  }
}

/** The email the facility itself publishes on its official website (home page, then a contact page). */
export async function findPublishedEmail(website: string | null | undefined): Promise<string | null> {
  if (!website || !isPublicWebsite(website)) return null;
  const home = await readPage(website);
  let emails = extractPublishedEmails(home, website);
  if (emails.length === 0) {
    const contactHref = /href=["']([^"']*contact[^"']*)["']/i.exec(home)?.[1];
    const candidates = new Set<string>();
    if (contactHref) {
      try {
        candidates.add(new URL(contactHref, website).toString());
      } catch {
        // Ignore a malformed link.
      }
    }
    candidates.add(new URL("/contact", website).toString());
    for (const url of candidates) {
      if (!isPublicWebsite(url)) continue;
      emails = extractPublishedEmails(await readPage(url), website);
      if (emails.length) break;
    }
  }
  return emails[0] ?? null;
}

/** Street address for the user's GPS fix, when Google can give one. Null otherwise. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = googleKey();
  if (!key) return null;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=street_address|route|neighborhood|locality&key=${key}`,
      { headers: { Referer: "https://allmasafetyai.online/" }, signal: AbortSignal.timeout(3_000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { status?: string; results?: Array<{ formatted_address?: string }> };
    return json.status === "OK" ? (json.results?.[0]?.formatted_address ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Nearest hospitals / clinics / health centres around a point, with their real phone numbers
 * and the emails they publish. Anything unknown stays null; nothing is guessed.
 */
export async function findEmergencyFacilities(lat: number, lng: number): Promise<EmergencyFacility[]> {
  const { lookupNearbyPlaces } = await import("@/lib/places.server");
  const places = await lookupNearbyPlaces({
    latitude: lat,
    longitude: lng,
    radiusMeters: SEARCH_RADIUS_M,
    limit: 24,
    types: ["hospital", "medical_clinic", "doctor"],
  });

  const nearest = places
    .filter((place) => isHealthFacility(place))
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, DETAIL_CANDIDATES);

  const key = googleKey();
  const candidates = await Promise.all(
    nearest.map(async (place): Promise<FacilityCandidate> => {
      const base: FacilityCandidate = {
        id: place.id,
        name: place.name,
        type: place.type,
        address: place.address,
        phone: place.phone,
        website: null,
        email: null,
        distance_m: place.distance_m,
        open_now: place.open_now,
        is_24h: place.source === "seeded" && place.open_now === true,
        latitude: place.latitude,
        longitude: place.longitude,
        source: place.source,
      };
      if (place.source !== "google" || !key) return base;
      const details = await fetchPlaceDetails(place.id.replace(/^google:/, ""), key);
      if (!details) return base;
      const website = details.websiteUri ?? null;
      const email = await findPublishedEmail(website);
      return {
        ...base,
        phone: details.nationalPhoneNumber ?? details.internationalPhoneNumber ?? base.phone,
        address: details.formattedAddress ?? base.address,
        website,
        email,
        open_now: details.currentOpeningHours?.openNow ?? base.open_now,
        is_24h: opensAroundTheClock(details),
      };
    }),
  );

  return pickEmergencyFacilities(candidates);
}
