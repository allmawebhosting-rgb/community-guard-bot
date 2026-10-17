export type PreciseFix = { lat: number; lng: number; accuracy: number };

/**
 * Watches GPS/Wi-Fi positioning for a short window and keeps the most accurate fix.
 * Desktops often return a coarse network fix first; this waits for a better one.
 */
export function getPreciseLocation(opts: {
  targetAccuracy?: number;
  maxWaitMs?: number;
  onUpdate?: (fix: PreciseFix) => void;
} = {}): Promise<PreciseFix> {
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
