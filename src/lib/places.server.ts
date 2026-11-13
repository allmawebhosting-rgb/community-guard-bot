import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { withTimeoutFallback } from "@/lib/async-timeout";
import { getSeededNearbyFacilities } from "@/lib/nearby-fallback";
import { resolveUgandaPlace } from "@/lib/uganda-places";
import { facilityKind } from "@/lib/facility-kind";

/** Public (anon) client for the public emergency directory; works without the admin key. */
function publicDirectoryClient() {
  const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Directory lookup unavailable: backend URL/key missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Picks a real Google key (AIza...), ignoring connector placeholders such as lovc_... */
export function resolveGoogleMapsKey(env: Record<string, string | undefined>) {
  const candidates = [
    env["GOOGLE_MAPS_API_KEY"],
    env["GOOGLE_PLACES_API_KEY"],
    env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"],
  ];
  return candidates.find((k) => typeof k === "string" && k.trim().startsWith("AIza"))?.trim();
}

const GOOGLE_API_URL = "https://places.googleapis.com/v1";
const MAX_RADIUS_M = 15_000;
const MAX_RESULTS = 20;
const MAX_CACHE_ENTRIES = 1_000;
/** Hard caps so one slow Google/directory call cannot stall a chat reply. */
export const GOOGLE_PLACES_TIMEOUT_MS = 4_500;
export const DIRECTORY_LOOKUP_TIMEOUT_MS = 2_500;
export const PLACE_PHONE_TIMEOUT_MS = 2_000;
export const PLACE_PHONE_MAX = 5;
export const PLACE_PHONE_BUDGET_MS = 2_500;

/** Categories Google Places (New) accepts for a nearby search of help facilities. */
const SUPPORTED_PLACE_TYPES = new Set([
  "hospital",
  "police",
  "fire_station",
  "doctor",
  "pharmacy",
  "medical_clinic",
  "dental_clinic",
  "medical_lab",
]);

/** Loose names used across the app mapped onto categories Google understands. */
const PLACE_TYPE_ALIASES: Record<string, string> = {
  clinic: "doctor",
  clinics: "doctor",
  health: "doctor",
  health_centre: "doctor",
  health_center: "doctor",
  medical: "doctor",
  medical_center: "doctor",
  medical_centre: "doctor",
  dispensary: "pharmacy",
  chemist: "pharmacy",
  fire: "fire_station",
  fire_brigade: "fire_station",
  police_station: "police",
  police_post: "police",
  ambulance: "hospital",
  drugstore: "pharmacy",
};

export const DEFAULT_PLACE_TYPES = [
  "hospital",
  "medical_clinic",
  "doctor",
  "police",
  "fire_station",
  "pharmacy",
];

/** Translate/drop unsupported categories so one bad value can't fail the whole search. */
function normalizeGoogleTypes(types: string[]) {
  const mapped = types
    .map((value) => value.trim().toLowerCase())
    .map((value) => PLACE_TYPE_ALIASES[value] ?? value)
    .filter((value) => SUPPORTED_PLACE_TYPES.has(value));
  const unique = [...new Set(mapped)];
  return unique.length ? unique : DEFAULT_PLACE_TYPES;
}

const NearbyPlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  open_now: z.boolean().nullable(),
  distance_m: z.number(),
  latitude: z.number(),
  longitude: z.number(),
  source: z.enum(["google", "seeded"]),
  photo_name: z.string().nullable().optional(),
});

export type NearbyPlaceResult = z.infer<typeof NearbyPlaceSchema>;

export type NearbyPlacesInput = {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  limit?: number;
  types?: string[];
  searchText?: string;
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizePlaceName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupePlaces(items: NearbyPlaceResult[]) {
  const seen = new Map<string, NearbyPlaceResult>();
  for (const item of items) {
    const key = `${normalizePlaceName(item.name)}:${item.latitude.toFixed(5)}:${item.longitude.toFixed(5)}`;
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

function placeCategory(type: string, name = "") {
  return facilityKind(type, name);
}

function diversifyPlaces(places: NearbyPlaceResult[], limit: number) {
  const selected: NearbyPlaceResult[] = [];
  const selectedCategories = new Set<string>();
  for (const place of places) {
    const category = placeCategory(place.type, place.name);
    if (!selectedCategories.has(category)) {
      selected.push(place);
      selectedCategories.add(category);
    }
    if (selected.length === limit) return selected;
  }
  return [
    ...selected,
    ...places.filter((place) => !selected.some((item) => item.id === place.id)),
  ].slice(0, limit);
}

async function loadSeededFacilities(latitude: number, longitude: number, radiusMeters: number) {
  const { data, error } = await publicDirectoryClient()
    .from("facilities")
    .select("id, name, facility_type, address, district, phone, is_24_7, latitude, longitude")
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((item) => {
      const lat = Number(item.latitude);
      const lng = Number(item.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
      const distance = haversineMeters(latitude, longitude, lat, lng);
      return distance <= radiusMeters;
    })
    .map((item) => ({
      id: `seeded:${item.id}`,
      name: String(item.name ?? "Facility"),
      type: String(item.facility_type ?? "facility"),
      address: item.address ?? item.district ?? null,
      phone: item.phone ?? null,
      open_now: item.is_24_7 ? true : null,
      distance_m: haversineMeters(
        latitude,
        longitude,
        Number(item.latitude),
        Number(item.longitude),
      ),
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      source: "seeded" as const,
    }))
    .filter((item) => Number.isFinite(item.distance_m));
}

async function loadPoliceStations(latitude: number, longitude: number, radiusMeters: number) {
  const { data, error } = await publicDirectoryClient()
    .from("police_stations")
    .select("id, name, district, parish, phone, latitude, longitude")
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((item) => ({
      id: `police_station:${item.id}`,
      name: String(item.name ?? "Police station"),
      type: "police",
      address: item.parish ? `${item.parish}, ${item.district}` : (item.district ?? null),
      phone: item.phone ?? null,
      open_now: null,
      distance_m: haversineMeters(
        latitude,
        longitude,
        Number(item.latitude),
        Number(item.longitude),
      ),
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      source: "seeded" as const,
    }))
    .filter(
      (item) =>
        Number.isFinite(item.latitude) &&
        Number.isFinite(item.longitude) &&
        Number.isFinite(item.distance_m) &&
        item.distance_m <= radiusMeters,
    );
}

async function loadGooglePlaces(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  types: string[],
) {
  // Read credentials at call time — env injection happens per request, not at module load.
  const googleMapsKey = resolveGoogleMapsKey({
    ...(import.meta.env as Record<string, string | undefined>),
    ...process.env,
  });

  if (!googleMapsKey) {
    console.warn("Google Places lookup skipped: GOOGLE_MAPS_API_KEY is not configured.");
    return [] as NearbyPlaceResult[];
  }

  const includedTypes = normalizeGoogleTypes(types);
  const response = await fetch(`${GOOGLE_API_URL}/places:searchNearby`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": googleMapsKey,
      Referer: "https://allmasafetyai.online/",
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.internationalPhoneNumber,places.currentOpeningHours.openNow,places.primaryType,places.photos",
    },
    signal: AbortSignal.timeout(GOOGLE_PLACES_TIMEOUT_MS),
    body: JSON.stringify({
      locationRestriction: {
        circle: {
          center: { latitude, longitude },
          radius: Math.min(Math.max(radiusMeters, 200), MAX_RADIUS_M),
        },
      },
      includedTypes,
      maxResultCount: MAX_RESULTS,
      rankPreference: "DISTANCE",
    }),
  });

  if (response.status === 403) {
    const body = await response.text().catch(() => "");
    if (body.includes("API_KEY_HTTP_REFERRER_BLOCKED")) {
      console.warn("Google Places lookup blocked: API key HTTP referrer is not allowed.");
      return [] as NearbyPlaceResult[];
    }
    if (body.includes("API_KEY_SERVICE_BLOCKED")) {
      console.warn(
        "Google Places lookup blocked: Google Maps service is not enabled for this API key.",
      );
      return [] as NearbyPlaceResult[];
    }
    console.warn("Google Places lookup blocked by Google Maps API configuration.", body);
    return [] as NearbyPlaceResult[];
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.warn(
      `Google Places lookup failed [${response.status}] types=${includedTypes.join(",")}: ${body}`,
    );
    return [] as NearbyPlaceResult[];
  }

  const result = (await response.json()) as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      nationalPhoneNumber?: string;
      internationalPhoneNumber?: string;
      currentOpeningHours?: { openNow?: boolean };
      primaryType?: string;
      photos?: Array<{ name?: string }>;
    }>;
  };

  return (result.places ?? [])
    .filter((place) => place.location?.latitude != null && place.location?.longitude != null)
    .map((place) => ({
      id: `google:${place.id ?? `${place.displayName?.text ?? "place"}-${place.location?.latitude ?? 0}-${place.location?.longitude ?? 0}`}`,
      name: place.displayName?.text ?? "Nearby place",
      type: place.primaryType ?? "service",
      address: place.formattedAddress ?? null,
      phone: place.nationalPhoneNumber || place.internationalPhoneNumber || null,
      open_now: place.currentOpeningHours?.openNow ?? null,
      distance_m: haversineMeters(
        latitude,
        longitude,
        place.location!.latitude!,
        place.location!.longitude!,
      ),
      latitude: place.location!.latitude!,
      longitude: place.location!.longitude!,
      source: "google" as const,
      photo_name: place.photos?.[0]?.name ?? null,
    }))
    .filter((item) => Number.isFinite(item.distance_m));
}

function cacheKey(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  types: string[],
  limit: number,
) {
  const roundedLat = Math.round(latitude * 1000) / 1000;
  const roundedLng = Math.round(longitude * 1000) / 1000;
  return [
    roundedLat,
    roundedLng,
    Math.round(radiusMeters / 100),
    [...types].sort().join("|"),
    limit,
  ].join(":");
}

const placeCache = new Map<string, { expiresAt: number; data: NearbyPlaceResult[] }>();

export async function lookupNearbyPlaces(input: NearbyPlacesInput): Promise<NearbyPlaceResult[]> {
  const gazetteerMatch = input.searchText ? resolveUgandaPlace(input.searchText) : null;
  const latitude = gazetteerMatch?.lat ?? Number(input.latitude);
  const longitude = gazetteerMatch?.lng ?? Number(input.longitude);
  const radiusMeters = Math.min(Number(input.radiusMeters ?? 2500), MAX_RADIUS_M);
  const limit = Math.min(Number(input.limit ?? 10), MAX_RESULTS);
  const types =
    Array.isArray(input.types) && input.types.length ? input.types : DEFAULT_PLACE_TYPES;

  const cacheKeyValue = cacheKey(latitude, longitude, radiusMeters, types, limit);
  const cached = placeCache.get(cacheKeyValue);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data.slice(0, limit);
  }

  const [googleResult, seededResult, policeResult] = await Promise.allSettled([
    withTimeoutFallback<NearbyPlaceResult[]>(
      loadGooglePlaces(latitude, longitude, radiusMeters, types),
      GOOGLE_PLACES_TIMEOUT_MS,
      [],
      "google-places",
    ),
    withTimeoutFallback<NearbyPlaceResult[]>(
      loadSeededFacilities(latitude, longitude, radiusMeters),
      DIRECTORY_LOOKUP_TIMEOUT_MS,
      [],
      "seeded-facilities",
    ),
    normalizeGoogleTypes(types).includes("police")
      ? withTimeoutFallback<NearbyPlaceResult[]>(
          loadPoliceStations(latitude, longitude, radiusMeters),
          DIRECTORY_LOOKUP_TIMEOUT_MS,
          [],
          "police-stations",
        )
      : Promise.resolve([] as NearbyPlaceResult[]),
  ]);
  const googlePlaces = googleResult.status === "fulfilled" ? googleResult.value : [];
  const seeded = seededResult.status === "fulfilled" ? seededResult.value : [];
  const policeStations = policeResult.status === "fulfilled" ? policeResult.value : [];
  if (
    googleResult.status === "rejected" ||
    seededResult.status === "rejected" ||
    policeResult.status === "rejected"
  ) {
    console.warn("A nearby-place source is unavailable; continuing with available listings.");
  }

  const availablePlaces = dedupePlaces([...googlePlaces, ...seeded, ...policeStations]).sort(
    (a, b) => a.distance_m - b.distance_m,
  );
  const requestedCategories = new Set(
    normalizeGoogleTypes(types).map((type) => placeCategory(type)),
  );
  const availableCategories = new Set(
    availablePlaces.map((place) => placeCategory(place.type, place.name)),
  );
  const needsMoreResults = availablePlaces.length < Math.min(3, limit);
  const localFallback = getSeededNearbyFacilities({ lat: latitude, lng: longitude }, radiusMeters)
    .filter((place) => {
      const category = placeCategory(place.type, place.name);
      return (
        requestedCategories.has(category) &&
        (needsMoreResults || !availableCategories.has(category))
      );
    })
    .map((place) => ({ ...place, source: "seeded" as const }));
  const sorted = dedupePlaces([...availablePlaces, ...localFallback]).sort(
    (a, b) => a.distance_m - b.distance_m,
  );
  const combined = diversifyPlaces(sorted, limit);

  const now = Date.now();
  for (const [key, value] of placeCache) {
    if (value.expiresAt <= now) placeCache.delete(key);
  }
  if (placeCache.size >= MAX_CACHE_ENTRIES && !placeCache.has(cacheKeyValue)) {
    const oldestKey = placeCache.keys().next().value;
    if (oldestKey) placeCache.delete(oldestKey);
  }
  placeCache.set(cacheKeyValue, {
    expiresAt: now + 180_000,
    data: combined,
  });

  return combined;
}

export function getNearbyPlacesClientSafe() {
  return {
    validate: (value: unknown) => NearbyPlaceSchema.safeParse(value),
  };
}

/** Valid Google place ids to look up, capped so the extra round-trips stay short. */
export function placeIdsForPhoneLookup(ids: string[], max = PLACE_PHONE_MAX): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const placeId = id.replace(/^google:/, "");
    if (!/^[A-Za-z0-9_-]+$/.test(placeId)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/** Remaining time in the phone-lookup budget; 0 means skip the extra calls. */
export function phoneLookupBudgetLeft(
  startedAt: number,
  now = Date.now(),
  budgetMs = PLACE_PHONE_BUDGET_MS,
): number {
  return Math.max(0, budgetMs - (now - startedAt));
}

/** Phone numbers from Google Place Details for places the nearby search returned without one. */
export async function fetchPlacePhones(
  ids: string[],
  opts?: { startedAt?: number; budgetMs?: number },
): Promise<Record<string, string>> {
  const key = resolveGoogleMapsKey({
    ...(import.meta.env as Record<string, string | undefined>),
    ...process.env,
  });
  const out: Record<string, string> = {};
  if (!key) return out;
  const startedAt = opts?.startedAt ?? Date.now();
  const budgetMs = opts?.budgetMs ?? PLACE_PHONE_BUDGET_MS;
  if (phoneLookupBudgetLeft(startedAt, Date.now(), budgetMs) <= 0) return out;
  await Promise.all(
    placeIdsForPhoneLookup(ids).map(async (id) => {
      if (phoneLookupBudgetLeft(startedAt, Date.now(), budgetMs) <= 0) return;
      const placeId = id.replace(/^google:/, "");
      try {
        const res = await fetch(`${GOOGLE_API_URL}/places/${placeId}`, {
          headers: {
            "X-Goog-Api-Key": key,
            Referer: "https://allmasafetyai.online/",
            "X-Goog-FieldMask": "nationalPhoneNumber,internationalPhoneNumber",
          },
          signal: AbortSignal.timeout(PLACE_PHONE_TIMEOUT_MS),
        });
        if (!res.ok) return;
        const body = (await res.json()) as { nationalPhoneNumber?: string; internationalPhoneNumber?: string };
        const phone = body.nationalPhoneNumber ?? body.internationalPhoneNumber;
        if (phone) out[id] = phone;
      } catch {
        // Ignore: the card simply shows no Call button.
      }
    }),
  );
  return out;
}
