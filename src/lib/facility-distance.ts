/** Shared (client + server) distance helpers for nearby-facility cards. */

export const CENTRAL_KAMPALA = { lat: 0.3152, lng: 32.5816 } as const;
export const DISTANCE_UNAVAILABLE_LABEL = "Distance unavailable – share location";

export type DistanceSource = "gps" | "named" | "fallback" | "none";
export type LatLng = { lat: number; lng: number };

/** `Number(null)` and `Number("")` are 0 — never let a missing value become a coordinate. */
export function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function validLatLng(lat: unknown, lng: unknown): LatLng | null {
  const la = toFiniteNumber(lat);
  const ln = toFiniteNumber(lng);
  if (la == null || ln == null) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  // (0, 0) is "null island" — a missing fix, not a place in Uganda.
  if (la === 0 && ln === 0) return null;
  return { lat: la, lng: ln };
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Short label: metres under 1 km, one decimal above. Never "0 km". */
export function formatKm(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  const metres = km * 1000;
  if (metres < 50) return "<50 m";
  if (metres < 950) return `${Math.round(metres / 10) * 10} m`;
  return `${Math.round(km * 10) / 10} km`;
}

export function distanceFromLabel(source: DistanceSource | undefined, areaLabel?: string | null): string | null {
  if (source === "fallback") return "from Central Kampala";
  if (source === "named") {
    const name = (areaLabel ?? "").split(",")[0]?.trim();
    return name ? `from ${name}` : null;
  }
  return null;
}

type WithCoords = { latitude?: unknown; longitude?: unknown; lat?: unknown; lng?: unknown; distance_km?: number | null };

/**
 * Recompute every distance from the origin with haversine, ignoring any value the
 * upstream source supplied (those can be 0 / stale). With no origin the distance is
 * removed so the UI shows "unavailable" instead of a made-up number.
 */
export function applyFacilityDistances<T extends WithCoords>(rows: T[], origin: LatLng | null): T[] {
  const measured = rows.map((row) => {
    const point = validLatLng(row.latitude ?? row.lat, row.longitude ?? row.lng);
    const km = origin && point ? haversineKm(origin, point) : null;
    return { ...row, distance_km: km == null ? null : Math.round(km * 100) / 100 };
  });
  if (!origin) return measured;
  return measured
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const ak = a.row.distance_km;
      const bk = b.row.distance_km;
      if (ak == null && bk == null) return a.index - b.index;
      if (ak == null) return 1;
      if (bk == null) return -1;
      return ak - bk || a.index - b.index;
    })
    .map((entry) => entry.row);
}
