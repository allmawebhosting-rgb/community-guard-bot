export type PreciseFix = { lat: number; lng: number; accuracy: number };
export type LiveLocationFix = PreciseFix & {
  timestamp: number;
  heading: number | null;
  speed: number | null;
};

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

/**
 * Keeps a high-accuracy location watch active while the nearby-help screen is open.
 * UI updates are limited to five seconds unless the user has moved at least 15 metres.
 */
export function watchLiveLocation(
  onUpdate: (fix: LiveLocationFix) => void,
  onError: (error: GeolocationPositionError) => void,
  options: { minimumIntervalMs?: number; minimumMovementMeters?: number } = {},
) {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    onError({
      code: 2,
      message: "Geolocation is not supported.",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    } as GeolocationPositionError);
    return () => {};
  }

  const minimumIntervalMs = options.minimumIntervalMs ?? 5000;
  const minimumMovementMeters = options.minimumMovementMeters ?? 15;
  let previous: LiveLocationFix | null = null;
  const watchId = navigator.geolocation.watchPosition(
    ({ coords, timestamp }) => {
      const fix: LiveLocationFix = {
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy: coords.accuracy,
        timestamp,
        heading: Number.isFinite(coords.heading) ? coords.heading : null,
        speed: Number.isFinite(coords.speed) ? coords.speed : null,
      };
      const movedEnough = previous ? distanceMeters(previous, fix) >= minimumMovementMeters : true;
      const intervalElapsed = previous ? timestamp - previous.timestamp >= minimumIntervalMs : true;
      if (!previous || movedEnough || intervalElapsed) {
        previous = fix;
        onUpdate(fix);
      }
    },
    onError,
    { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 },
  );

  return () => navigator.geolocation.clearWatch(watchId);
}

/**
 * Watches GPS/Wi-Fi positioning for a short window and keeps the most accurate fix.
 * Desktops often return a coarse network fix first; this waits for a better one.
 */
export function getPreciseLocation(
  opts: {
    targetAccuracy?: number;
    maxWaitMs?: number;
    onUpdate?: (fix: PreciseFix) => void;
  } = {},
): Promise<PreciseFix> {
  const target = opts.targetAccuracy ?? 50;
  const maxWait = opts.maxWaitMs ?? 15000;
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("unsupported"));
      return;
    }
    let best: PreciseFix | null = null;
    let done = false;
    const finish = (err?: GeolocationPositionError) => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(id);
      clearTimeout(timer);
      if (best) resolve(best);
      else reject(err ?? new Error("timeout"));
    };
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const fix = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy };
        if (!best || fix.accuracy < best.accuracy) {
          best = fix;
          opts.onUpdate?.(fix);
        }
        if (fix.accuracy <= target) finish();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED || !best) finish(err);
      },
      { enableHighAccuracy: true, timeout: maxWait, maximumAge: 0 },
    );
    const timer = setTimeout(() => finish(), maxWait);
  });
}

export function describeAccuracy(m: number) {
  if (m <= 50) return { label: `Precise (±${Math.round(m)} m)`, tone: "good" as const };
  if (m <= 500) return { label: `Approximate (±${Math.round(m)} m)`, tone: "ok" as const };
  return {
    label: `Rough area only (±${m >= 1000 ? (m / 1000).toFixed(1) + " km" : Math.round(m) + " m"})`,
    tone: "poor" as const,
  };
}
