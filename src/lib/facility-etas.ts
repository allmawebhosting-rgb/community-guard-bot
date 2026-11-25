/** Rough Uganda urban travel estimates from road distance — never invent traffic. */
export function estimateTravelTimes(distanceKm: number | null | undefined): {
  drive_min: number | null;
  walk_min: number | null;
} {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm < 0) {
    return { drive_min: null, walk_min: null };
  }
  const drive_min = Math.max(1, Math.round((distanceKm / 25) * 60)); // ~25 km/h city
  const walk_min = Math.max(1, Math.round((distanceKm / 4.5) * 60)); // ~4.5 km/h
  return { drive_min, walk_min };
}

export function formatEtaLabel(distanceKm: number | null | undefined) {
  const { drive_min, walk_min } = estimateTravelTimes(distanceKm);
  const parts: string[] = [];
  if (distanceKm != null && Number.isFinite(distanceKm)) {
    parts.push(`${distanceKm} km`);
  }
  if (drive_min != null) parts.push(`~${drive_min} min drive`);
  if (walk_min != null && walk_min <= 45) parts.push(`~${walk_min} min walk`);
  return parts.join(" · ");
}

/** Attach drive/walk ETA fields used by chat facility cards. */
export function withFacilityEtas<T extends { distance_km?: number | null; open_now?: boolean | null; is_24_7?: boolean | null }>(
  facilities: T[],
): Array<
  T & {
    drive_min: number | null;
    walk_min: number | null;
    eta_label: string;
  }
> {
  return facilities.map((facility) => {
    const etas = estimateTravelTimes(facility.distance_km);
    return {
      ...facility,
      ...etas,
      eta_label: formatEtaLabel(facility.distance_km),
    };
  });
}
