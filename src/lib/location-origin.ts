// Decides where a nearby-help search is centred. Pure so it can be unit-tested.
import { inUganda } from "@/lib/nearby-guard";
import { mentionsUgandaPlace, resolveUgandaPlace } from "@/lib/uganda-places";

export type SearchOrigin =
  | { kind: "named"; lat: number; lng: number; label: string }
  | { kind: "gps"; lat: number; lng: number; label: string }
  | { kind: "none" };

type Coords = { latitude: number; longitude: number } | null | undefined;

/**
 * A town the USER named (e.g. "police near Jinja") beats GPS. An area the model
 * filled in on its own — a "Kampala" default, a remembered home district — never
 * overrides a known GPS fix, so a user in Bugembe is not shown Kampala places.
 */
export function chooseSearchOrigin(input: { area?: string | null; userText: string; gps: Coords }): SearchOrigin {
  const area = (input.area ?? "").trim();
  const named = area ? resolveUgandaPlace(area) : null;
  const gps =
    input.gps && inUganda(Number(input.gps.latitude), Number(input.gps.longitude))
      ? { lat: Number(input.gps.latitude), lng: Number(input.gps.longitude) }
      : null;
  if (named && (!gps || mentionsUgandaPlace(input.userText, named))) {
    return { kind: "named", lat: named.lat, lng: named.lng, label: `${named.name}, ${named.district}` };
  }
  if (gps) return { kind: "gps", ...gps, label: "your current GPS location" };
  return { kind: "none" };
}
