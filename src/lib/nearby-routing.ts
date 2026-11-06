import type { NearbyRoute } from "@/components/allma/nearby-map";

export type RouteMode = "drive" | "walk";

type Coordinates = { lat: number; lng: number };

type OsrmResponse = {
  code?: string;
  message?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: number[][] };
    legs?: Array<{
      steps?: Array<{
        distance?: number;
        name?: string;
        maneuver?: { type?: string; modifier?: string };
      }>;
    }>;
  }>;
};

function humanDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function describeManeuver(type?: string, modifier?: string) {
  const direction = modifier?.replace(/_/g, " ");
  if (type === "arrive") return "arrive at your destination";
  if (type === "depart" || type === "continue" || type === "new name") {
    return direction ? `continue ${direction}` : "continue ahead";
  }
  if (type === "roundabout" || type === "rotary") return "enter the roundabout";
  if (type === "uturn") return "make a U-turn";
  if (type === "merge") return direction ? `merge ${direction}` : "merge";
  if (type === "fork") return direction ? `keep ${direction} at the fork` : "keep at the fork";
  return direction ? `turn ${direction}` : "continue ahead";
}

export async function getNearbyRoute(
  origin: Coordinates,
  destination: Coordinates,
  mode: RouteMode,
  signal?: AbortSignal,
): Promise<NearbyRoute> {
  const profile = mode === "walk" ? "routed-foot" : "routed-car";
  const url =
    `https://routing.openstreetmap.de/${profile}/route/v1/driving/` +
    `${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
    "?overview=full&geometries=geojson&steps=true";
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Route lookup failed (${response.status}).`);

  const result = (await response.json()) as OsrmResponse;
  const route = result.routes?.[0];
  if (result.code !== "Ok" || !route?.geometry?.coordinates?.length) {
    throw new Error(result.message || "No route is available for this destination.");
  }

  const coordinates = route.geometry.coordinates
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]))
    .map(([lng, lat]) => ({ lat, lng }));
  if (coordinates.length < 2) throw new Error("The route did not include a usable path.");

  const nextStep = route.legs?.[0]?.steps?.find(
    (step, index) => index > 0 && (step.distance ?? 0) > 0,
  );
  const maneuverText = describeManeuver(nextStep?.maneuver?.type, nextStep?.maneuver?.modifier);
  const street = nextStep?.name?.trim();
  const nextManeuver = nextStep
    ? `In ${humanDistance(nextStep.distance ?? 0)}, ${maneuverText}${street ? ` onto ${street}` : ""}`
    : null;

  return {
    coordinates,
    distance_m: route.distance ?? 0,
    duration_s: route.duration ?? 0,
    nextManeuver,
  };
}
