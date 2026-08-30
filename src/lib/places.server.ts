import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GOOGLE_API_URL = "https://maps.googleapis.com";
const GOOGLE_MAPS_KEY = process.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] || process.env["GOOGLE_MAPS_API_KEY"];
const MAX_RADIUS_M = 10_000;
const MAX_RESULTS = 20;

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
});

export type NearbyPlaceResult = z.infer<typeof NearbyPlaceSchema>;

export type NearbyPlacesInput = {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  limit?: number;
  types?: string[];
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

async function loadSeededFacilities(latitude: number, longitude: number, radiusMeters: number) {
  const { data, error } = await supabaseAdmin
    .from("facilities")
    .select("id, name, facility_type, address, district, phone, latitude, longitude")
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
      open_now: null,
      distance_m: haversineMeters(latitude, longitude, Number(item.latitude), Number(item.longitude)),
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      source: "seeded" as const,
    }))
    .filter((item) => Number.isFinite(item.distance_m));
}

async function loadGooglePlaces(latitude: number, longitude: number, radiusMeters: number, types: string[]) {
  if (!GOOGLE_MAPS_KEY) return [] as NearbyPlaceResult[];

  const normalizedTypes = [...new Set(types)].slice(0, 5);
  const typeQuery = normalizedTypes.join("|");
  const response = await fetch(
    `${GOOGLE_API_URL}/v1/places:searchNearby?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationRestriction: {
          circle: {
            center: { latitude, longitude },
            radius: Math.min(Math.max(radiusMeters, 200), MAX_RADIUS_M),
          },
        },
        includedTypes: typeQuery ? normalizedTypes : ["hospital", "police", "fire_station", "clinic"],
        maxResultCount: Math.min(Math.max(20, 10), MAX_RESULTS),
        rankPreference: "DISTANCE",
        fieldMask: "displayName,formattedAddress,location,nationalPhoneNumber,currentOpeningHours.openNow,primaryType",
      }),
    },
  );

  if (!response.ok) {
    console.warn("Google Places lookup failed", await response.text().catch(() => ""));
    return [] as NearbyPlaceResult[];
  }

  const result = (await response.json()) as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      nationalPhoneNumber?: string;
      currentOpeningHours?: { openNow?: boolean };
      primaryType?: string;
    }>;
  };

  return (result.places ?? [])
    .filter((place) => place.location?.latitude != null && place.location?.longitude != null)
    .map((place) => ({
      id: `google:${place.id ?? `${place.displayName?.text ?? "place"}-${place.location?.latitude ?? 0}-${place.location?.longitude ?? 0}`}`,
      name: place.displayName?.text ?? "Nearby place",
      type: place.primaryType ?? "service",
      address: place.formattedAddress ?? null,
      phone: place.nationalPhoneNumber ?? null,
      open_now: place.currentOpeningHours?.openNow ?? null,
      distance_m: haversineMeters(latitude, longitude, place.location!.latitude!, place.location!.longitude!),
      latitude: place.location!.latitude!,
      longitude: place.location!.longitude!,
      source: "google" as const,
    }))
    .filter((item) => Number.isFinite(item.distance_m));
}

function cacheKey(latitude: number, longitude: number, radiusMeters: number, types: string[]) {
  const roundedLat = Math.round(latitude * 1000) / 1000;
  const roundedLng = Math.round(longitude * 1000) / 1000;
  return [roundedLat, roundedLng, Math.round(radiusMeters / 100), [...types].sort().join("|")].join(":");
}

const placeCache = new Map<string, { expiresAt: number; data: NearbyPlaceResult[] }>();

export async function lookupNearbyPlaces(input: NearbyPlacesInput): Promise<NearbyPlaceResult[]> {
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const radiusMeters = Math.min(Number(input.radiusMeters ?? 2500), MAX_RADIUS_M);
  const limit = Math.min(Number(input.limit ?? 10), MAX_RESULTS);
  const types = Array.isArray(input.types) && input.types.length ? input.types : ["hospital", "police", "fire_station", "clinic"];

  const cacheKeyValue = cacheKey(latitude, longitude, radiusMeters, types);
  const cached = placeCache.get(cacheKeyValue);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data.slice(0, limit);
  }

  const [googlePlaces, seeded] = await Promise.all([
    loadGooglePlaces(latitude, longitude, radiusMeters, types),
    loadSeededFacilities(latitude, longitude, radiusMeters),
  ]);

  const combined = dedupePlaces([...googlePlaces, ...seeded])
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, limit);

  placeCache.set(cacheKeyValue, {
    expiresAt: Date.now() + 180_000,
    data: combined,
  });

  return combined;
}

export function getNearbyPlacesClientSafe() {
  return {
    validate: (value: unknown) => NearbyPlaceSchema.safeParse(value),
  };
}
