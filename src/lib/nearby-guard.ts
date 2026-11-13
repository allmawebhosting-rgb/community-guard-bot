/** Results farther than this are never shown as "nearby". */
export const MAX_NEARBY_KM = 50;

/** Rough Uganda bounding box (with a small margin). */
export function inUganda(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -1.6 && lat <= 4.4 && lng >= 29.4 && lng <= 35.2;
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}
