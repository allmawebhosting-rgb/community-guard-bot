import { useSyncExternalStore } from "react";
import { validLatLng, type LatLng } from "@/lib/facility-distance";

/**
 * Latest device location the user has shared in this session. Facility cards read it
 * so their distances update the moment location is granted, without a new search.
 */
let current: LatLng | null = null;
const listeners = new Set<() => void>();

export function setSharedUserLocation(lat: unknown, lng: unknown) {
  const next = validLatLng(lat, lng);
  if (!next) return;
  if (current && Math.abs(current.lat - next.lat) < 1e-5 && Math.abs(current.lng - next.lng) < 1e-5) return;
  current = next;
  for (const listener of listeners) listener();
}

export function getSharedUserLocation(): LatLng | null {
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSharedUserLocation(): LatLng | null {
  return useSyncExternalStore(subscribe, getSharedUserLocation, () => null);
}
