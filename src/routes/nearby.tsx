import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Clock,
  Crosshair,
  Flame,
  Footprints,
  Hospital,
  MapPin,
  Navigation2,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/allma/app-shell";
import { ClientOnly } from "@/components/allma/client-only";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getNearbyMembers, getNearbyPlaces } from "@/lib/places.functions";
import { sendConnectionRequest } from "@/lib/safety-network";
import { getSeededNearbyFacilities } from "@/lib/nearby-fallback";
import type { NearbyMember, NearbyPlace } from "@/lib/places.types";
import { describeAccuracy, watchLiveLocation, type LiveLocationFix } from "@/lib/precise-location";
import {
  getNearestUgandaPlace,
  getUgandaPlaceSuggestions,
  type UgandaPlace,
} from "@/lib/uganda-places";
import { getNearbyRoute, type RouteMode } from "@/lib/nearby-routing";
import { helpKind, HELP_KIND_COLOR } from "@/components/allma/nearby-help-list";

const NearbyMap = lazy(() =>
  import("@/components/allma/nearby-map").then((module) => ({ default: module.NearbyMap })),
);

export const Route = createFileRoute("/nearby")({
  head: () => ({
    meta: [
      { title: "Nearby hospitals & police stations — Allma Safety AI" },
      {
        name: "description",
        content:
          "Find hospitals, police stations, fire and rescue facilities near you in Uganda, with phone numbers and 24/7 availability.",
      },
      { property: "og:title", content: "Nearby help — Allma Safety AI" },
      {
        property: "og:description",
        content:
          "Hospitals, police stations and rescue services near you with direct call numbers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NearbyScreen,
});

const TYPE_LABELS: Record<string, string> = {
  hospital: "Hospital",
  clinic: "Clinic",
  doctor: "Clinic",
  medical_clinic: "Clinic",
  pharmacy: "Pharmacy",
  police: "Police Station",
  police_station: "Police Station",
  police_post: "Police Post",
  fire: "Fire Station",
  fire_station: "Fire & Rescue",
  ambulance: "Ambulance",
};

const FILTER_TYPES = [
  { value: "all", label: "All services", color: "#64748b", icon: MapPin },
  { value: "medical", label: "Hospitals & clinics", color: "#10b981", icon: Hospital },
  { value: "police", label: "Police stations & posts", color: "#2563eb", icon: Shield },
  { value: "pharmacy", label: "Pharmacies & first aid", color: "#14b8a6", icon: Plus },
  { value: "fire", label: "Fire & rescue", color: "#f59e0b", icon: Flame },
] as const;

const DEFAULT_LOCATION = { lat: 0.3152, lng: 32.5816 };
const DEFAULT_AREA: UgandaPlace = {
  name: "Kampala Central",
  district: "Kampala",
  ...DEFAULT_LOCATION,
};

function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function distanceBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function matchesCategory(place: NearbyPlace, category: string) {
  const kind = helpKind(place.type, place.name);
  if (category === "all") return true;
  if (category === "medical") return kind === "hospital" || kind === "clinic";
  return kind === category;
}

function mergeNearbyPlaces(...sources: NearbyPlace[][]) {
  const unique = new Map<string, NearbyPlace>();
  for (const place of sources.flat()) {
    const key = `${place.name.trim().toLowerCase()}:${place.latitude.toFixed(5)}:${place.longitude.toFixed(5)}`;
    if (!unique.has(key)) unique.set(key, place);
  }
  return [...unique.values()].sort((a, b) => a.distance_m - b.distance_m);
}

function directionsUrl(
  origin: { lat: number; lng: number } | null,
  place: NearbyPlace,
  mode: RouteMode,
) {
  const destination = `${place.latitude},${place.longitude}`;
  const travelMode = mode === "walk" ? "walking" : "driving";
  const isApple = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isApple) {
    return `https://maps.apple.com/?${origin ? `saddr=${origin.lat},${origin.lng}&` : ""}daddr=${destination}&dirflg=${mode === "walk" ? "w" : "d"}`;
  }
  return `https://www.google.com/maps/dir/?api=1${origin ? `&origin=${origin.lat},${origin.lng}` : ""}&destination=${destination}&travelmode=${travelMode}&dir_action=navigate`;
}

function FacilityIcon({ type, name }: { type: string; name?: string }) {
  const kind = helpKind(type, name);
  const Icon =
    kind === "police" ? Shield : kind === "fire" ? Flame : kind === "pharmacy" ? Plus : Hospital;
  return <Icon className="h-5 w-5" aria-hidden="true" />;
}

function formatEta(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

function NearbyScreen() {
  const { isAuthenticated } = useAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [location, setLocation] = useState<LiveLocationFix | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [sendingRequestId, setSendingRequestId] = useState<string | null>(null);
  const [searchArea, setSearchArea] = useState<UgandaPlace | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [routeMode, setRouteMode] = useState<RouteMode>("drive");
  const [route, setRoute] = useState<Awaited<ReturnType<typeof getNearbyRoute>> | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const stopWatchingRef = useRef<(() => void) | null>(null);
  const activeRouteRef = useRef<{
    key: string;
    origin: { lat: number; lng: number };
    controller: AbortController;
  } | null>(null);

  const locate = () => {
    stopWatchingRef.current?.();
    setLocating(true);
    setLocationError(null);
    stopWatchingRef.current = watchLiveLocation(
      (fix) => {
        setLocation(fix);
        setLocationError(null);
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        const denied = error.code === error.PERMISSION_DENIED;
        setLocationError(
          denied
            ? "Location access is blocked. Allow location for this site in your browser settings, then try again."
            : "We couldn't get your position. Turn on Location Services or search for a Uganda area to browse nearby services.",
        );
      },
      { minimumIntervalMs: 6000, minimumMovementMeters: 15 },
    );
  };
  // Never stay on "Locating…" forever.
  useEffect(() => {
    if (!locating) return;
    const t = window.setTimeout(() => {
      setLocating(false);
      setLocationError(
        "Your location is unavailable right now. Distances are from Kampala Central — turn on Location Services or search for your area.",
      );
    }, 12_000);
    return () => window.clearTimeout(t);
  }, [locating]);
  useEffect(() => {
    locate();
    return () => {
      stopWatchingRef.current?.();
      activeRouteRef.current?.controller.abort();
    };
  }, []);
  const acc = location ? describeAccuracy(location.accuracy) : null;
  const searchCenter = useMemo(
    () => searchArea ?? (location ? { lat: location.lat, lng: location.lng } : DEFAULT_AREA),
    [location, searchArea],
  );
  const placeLatitudeKey = location?.lat.toFixed(3) ?? null;
  const placeLongitudeKey = location?.lng.toFixed(3) ?? null;
  const placeSearchCenter = useMemo(
    () =>
      searchArea ??
      (placeLatitudeKey !== null && placeLongitudeKey !== null
        ? { lat: Number(placeLatitudeKey), lng: Number(placeLongitudeKey) }
        : DEFAULT_AREA),
    [placeLatitudeKey, placeLongitudeKey, searchArea],
  );
  // Distances use the precise GPS fix (or the chosen area), never a rounded key.
  const distanceOrigin = useMemo(
    () => searchArea ?? (location ? { lat: location.lat, lng: location.lng } : DEFAULT_AREA),
    [searchArea, location?.lat, location?.lng],
  );
  const nearestArea = useMemo(
    () => (location ? getNearestUgandaPlace(location) : null),
    [location],
  );
  const visibleArea = searchArea ?? (location ? nearestArea : DEFAULT_AREA);
  const locationStatus = searchArea
    ? `Approximate area · ${searchArea.name}`
    : location
      ? `${acc?.label.replace("Precise", "Accurate").replace(/[()]/g, "") ?? "Live GPS"}${nearestArea ? ` · ${nearestArea.name}` : ""}`
      : locating
        ? "Locating… · previewing Kampala Central"
        : "Approximate map · Kampala Central";
  const canShowMap = Boolean(searchCenter);

  const {
    data: facilities,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["facilities"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("facilities")
        .select("id, name, facility_type, address, district, phone, is_24_7, latitude, longitude")
        .order("name")
        .limit(60);
      if (error) throw error;
      return data;
    },
  });

  const livePlacesQuery = useQuery({
    queryKey: [
      "nearby-places",
      placeSearchCenter.lat,
      placeSearchCenter.lng,
      searchArea?.name,
    ],
    enabled: canShowMap,
    queryFn: async () => {
      const data = await getNearbyPlaces({
        data: {
          latitude: placeSearchCenter.lat,
          longitude: placeSearchCenter.lng,
          radiusMeters: 8000,
          limit: 20,
          types: ["hospital", "medical_clinic", "doctor", "police", "fire_station", "pharmacy"],
          ...(searchArea ? { searchText: searchArea.name } : {}),
        },
      });
      return (data ?? []) as NearbyPlace[];
    },
  });

  const nearbyMembersQuery = useQuery({
    queryKey: [
      "nearby-members",
      location ? location.lat.toFixed(3) : null,
      location ? location.lng.toFixed(3) : null,
    ],
    enabled: Boolean(location) && isAuthenticated,
    queryFn: async () => {
      const data = await getNearbyMembers({
        data: {
          latitude: location!.lat,
          longitude: location!.lng,
          radiusMeters: 2000,
          limit: 10,
        },
      });
      return (data ?? []) as NearbyMember[];
    },
  });

  const fallbackPlaces = useMemo<NearbyPlace[]>(() => {
    if (!searchCenter) return [];
    return (facilities ?? []).flatMap((facility) => {
      if (facility.latitude == null || facility.longitude == null) return [];
      const latitude = Number(facility.latitude);
      const longitude = Number(facility.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      const distance = distanceBetween(searchCenter, { lat: latitude, lng: longitude });
      if (distance > 10_000) return [];
      return [
        {
          id: `seeded:${facility.id}`,
          name: facility.name,
          type: facility.facility_type ?? "facility",
          address: facility.address ?? facility.district ?? null,
          phone: facility.phone ?? null,
          open_now: facility.is_24_7 ? true : null,
          distance_m: distance,
          latitude,
          longitude,
          source: "seeded" as const,
        },
      ];
    });
  }, [facilities, placeSearchCenter]);
  const localFallbackPlaces = useMemo(
    () => getSeededNearbyFacilities(placeSearchCenter),
    [placeSearchCenter],
  );

  const candidates = useMemo(
    () => mergeNearbyPlaces(livePlacesQuery.data ?? [], fallbackPlaces, localFallbackPlaces),
    [fallbackPlaces, livePlacesQuery.data, localFallbackPlaces],
  );
  const filteredPlaces = useMemo(() => {
    const query = searchArea ? "" : search.trim().toLowerCase();
    return candidates
      .filter((place) => matchesCategory(place, filter))
      .filter(
        (place) =>
          !query ||
          [place.name, place.address, place.type].some((value) =>
            (value ?? "").toLowerCase().includes(query),
          ),
      )
      .map((place) =>
        distanceOrigin
          ? {
              ...place,
              distance_m: distanceBetween(distanceOrigin, {
                lat: place.latitude,
                lng: place.longitude,
              }),
            }
          : place,
      )
      .sort((a, b) => a.distance_m - b.distance_m);
  }, [candidates, filter, search, searchArea, distanceOrigin]);
  const selectedPlace = filteredPlaces.find((place) => place.id === selectedPlaceId) ?? null;

  const placeSuggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length < 2 || searchArea)
      return { areas: [] as UgandaPlace[], facilities: [] as NearbyPlace[] };
    const areas = getUgandaPlaceSuggestions(search, 5);
    const matchedFacilities = candidates
      .filter((place) => place.name.toLowerCase().includes(query))
      .filter(
        (place) => !areas.some((area) => area.name.toLowerCase() === place.name.toLowerCase()),
      )
      .slice(0, 5);
    return { areas, facilities: matchedFacilities };
  }, [candidates, search, searchArea]);
  const suggestionCount = placeSuggestions.areas.length + placeSuggestions.facilities.length;

  function selectSuggestion(index: number) {
    if (index < 0 || index >= suggestionCount) return;
    if (index < placeSuggestions.areas.length) {
      selectArea(placeSuggestions.areas[index]);
      return;
    }
    selectFacility(placeSuggestions.facilities[index - placeSuggestions.areas.length]);
  }

  useEffect(() => {
    if (!location || !selectedPlace) {
      activeRouteRef.current?.controller.abort();
      activeRouteRef.current = null;
      setRoute(null);
      setRouteError(null);
      setRouteLoading(false);
      return;
    }
    const key = `${selectedPlace.id}:${routeMode}`;
    const last = activeRouteRef.current;
    if (last?.key === key && distanceBetween(last.origin, location) < 20) return;

    last?.controller.abort();
    const controller = new AbortController();
    const origin = { lat: location.lat, lng: location.lng };
    activeRouteRef.current = { key, origin, controller };
    setRouteLoading(true);
    setRouteError(null);
    void getNearbyRoute(
      origin,
      { lat: selectedPlace.latitude, lng: selectedPlace.longitude },
      routeMode,
      controller.signal,
    )
      .then((nextRoute) => {
        if (activeRouteRef.current?.controller === controller) setRoute(nextRoute);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRoute(null);
        setRouteError(
          error instanceof Error ? error.message : "A route is not available right now.",
        );
      })
      .finally(() => {
        if (activeRouteRef.current?.controller === controller) setRouteLoading(false);
      });
  }, [location, routeMode, selectedPlace]);

  useEffect(() => () => activeRouteRef.current?.controller.abort(), []);

  async function handleSendRequest(memberId: string) {
    setSendingRequestId(memberId);
    try {
      await sendConnectionRequest(memberId, "I’m nearby and would like to connect safely.");
      toast.success("Connection request sent");
      await nearbyMembersQuery.refetch();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send the connection request.",
      );
    } finally {
      setSendingRequestId(null);
    }
  }

  const hasLocation = Boolean(location);

  function selectArea(area: UgandaPlace) {
    setSearch(area.name);
    setSearchArea(area);
    setSelectedPlaceId(null);
    setSuggestionsOpen(false);
  }

  function selectFacility(place: NearbyPlace) {
    setSearch(place.name);
    setSearchArea(null);
    setSelectedPlaceId(place.id);
    setSuggestionsOpen(false);
  }

  return (
    <AppShell title="Nearby help">
      <div className="mx-auto w-full max-w-[1440px] px-4 pb-8 pt-5 sm:px-6 lg:px-10 lg:pt-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              Nearby services
            </p>
            <h1 className="font-display text-2xl font-black tracking-[-0.03em] lg:text-3xl">
              Find help around you
            </h1>
            <p className="mt-1 text-[12px] text-muted-foreground lg:text-[13px]">
              Nearby facilities and routes are guides; call ahead when possible.
            </p>
          </div>
          <div className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border border-blue-500/30 bg-background/85 px-3.5 py-2 text-[11px] font-bold text-blue-800 shadow-sm backdrop-blur-md dark:text-blue-200">
            <span
              className={`relative grid h-2.5 w-2.5 shrink-0 place-items-center rounded-full ${location ? "bg-emerald-500" : "bg-amber-500"}`}
            >
              {location && (
                <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-emerald-500/60" />
              )}
            </span>
            <span className="max-w-[min(68vw,340px)] truncate">{locationStatus}</span>
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              aria-label="Refresh live location"
              className="ml-1 rounded-full p-1 text-current transition hover:bg-blue-500/10 disabled:opacity-50"
            >
              <Crosshair className={`h-3.5 w-3.5 ${locating ? "animate-pulse" : ""}`} />
            </button>
          </div>
        </div>

        {locationError && !location && !searchArea && (
          <div
            role="status"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-[12px] text-amber-800 dark:text-amber-200"
          >
            <span>
              {locationError} Showing an approximate Kampala Central directory until you choose
              another area.
            </span>
            <button
              type="button"
              onClick={locate}
              className="shrink-0 rounded-full border border-current/25 px-3 py-1.5 font-bold"
            >
              Try again
            </button>
          </div>
        )}

        <div className="mb-4 flex flex-col gap-3">
          <div className="relative z-30 w-full">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              role="combobox"
              aria-label="Search Uganda areas and nearby facilities"
              aria-autocomplete="list"
              aria-expanded={
                suggestionsOpen &&
                (placeSuggestions.areas.length > 0 || placeSuggestions.facilities.length > 0)
              }
              aria-controls="nearby-search-suggestions"
              aria-activedescendant={
                activeSuggestionIndex >= 0
                  ? `nearby-suggestion-${activeSuggestionIndex}`
                  : undefined
              }
              placeholder="Search a facility, suburb, or road…"
              value={search}
              onFocus={() => {
                setSuggestionsOpen(true);
                setActiveSuggestionIndex(-1);
              }}
              onChange={(event) => {
                setSearch(event.target.value);
                setSearchArea(null);
                setSelectedPlaceId(null);
                setSuggestionsOpen(true);
                setActiveSuggestionIndex(-1);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSuggestionsOpen(false);
                  setActiveSuggestionIndex(-1);
                } else if (event.key === "ArrowDown" && suggestionCount > 0) {
                  event.preventDefault();
                  setSuggestionsOpen(true);
                  setActiveSuggestionIndex((index) => (index + 1) % suggestionCount);
                } else if (event.key === "ArrowUp" && suggestionCount > 0) {
                  event.preventDefault();
                  setSuggestionsOpen(true);
                  setActiveSuggestionIndex((index) =>
                    index <= 0 ? suggestionCount - 1 : index - 1,
                  );
                } else if (event.key === "Enter" && suggestionsOpen && activeSuggestionIndex >= 0) {
                  event.preventDefault();
                  selectSuggestion(activeSuggestionIndex);
                }
              }}
              className="h-12 w-full rounded-2xl border border-border/70 bg-card/90 pl-11 pr-11 text-[13px] shadow-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setSearch("");
                  setSearchArea(null);
                  setSelectedPlaceId(null);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {suggestionsOpen &&
              (placeSuggestions.areas.length > 0 || placeSuggestions.facilities.length > 0) && (
                <div
                  id="nearby-search-suggestions"
                  role="listbox"
                  className="absolute left-0 right-0 top-[calc(100%+6px)] max-h-80 overflow-y-auto rounded-2xl border border-border/70 bg-card p-2 shadow-xl"
                >
                  {placeSuggestions.areas.length > 0 && (
                    <>
                      <p className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                        Uganda areas & roads
                      </p>
                      {placeSuggestions.areas.map((area, index) => (
                        <button
                          id={`nearby-suggestion-${index}`}
                          key={`${area.name}-${area.district}`}
                          type="button"
                          role="option"
                          aria-selected={activeSuggestionIndex === index}
                          onClick={() => selectArea(area)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted/70 ${activeSuggestionIndex === index ? "bg-muted/70" : ""}`}
                        >
                          <MapPin className="h-4 w-4 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-bold">
                              {area.name}
                            </span>
                            <span className="block text-[10px] text-muted-foreground">
                              {area.district} District · approximate area
                            </span>
                          </span>
                          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      ))}
                    </>
                  )}
                  {placeSuggestions.facilities.length > 0 && (
                    <>
                      <p className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                        Nearby facilities
                      </p>
                      {placeSuggestions.facilities.map((place, index) => {
                        const suggestionIndex = placeSuggestions.areas.length + index;
                        return (
                          <button
                            id={`nearby-suggestion-${suggestionIndex}`}
                            key={place.id}
                            type="button"
                            role="option"
                            aria-selected={activeSuggestionIndex === suggestionIndex}
                            onClick={() => selectFacility(place)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted/70 ${activeSuggestionIndex === suggestionIndex ? "bg-muted/70" : ""}`}
                          >
                            <FacilityIcon type={place.type} name={place.name} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] font-bold">
                                {place.name}
                              </span>
                              <span className="block truncate text-[10px] text-muted-foreground">
                                {place.address || TYPE_LABELS[place.type] || place.type}
                              </span>
                            </span>
                            <span className="text-[10px] font-semibold text-primary">
                              {formatDistance(place.distance_m)}
                            </span>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter help facilities">
            {FILTER_TYPES.map((category) => {
              const Icon = category.icon;
              return (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => {
                    setFilter(category.value);
                    setSelectedPlaceId(null);
                  }}
                  aria-pressed={filter === category.value}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-bold transition ${
                    filter === category.value
                      ? "border-foreground/15 bg-foreground text-background shadow-sm"
                      : "border-border/60 bg-card/75 text-muted-foreground hover:border-foreground/20 hover:text-foreground"
                  }`}
                >
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
                    style={{ backgroundColor: `${category.color}20`, color: category.color }}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  {category.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(350px,0.85fr)]">
          <section aria-label="Map and route" className="min-w-0">
            {canShowMap && searchCenter ? (
              <div className="relative">
                <ClientOnly
                  fallback={
                    <div className="h-[390px] animate-pulse rounded-[1.5rem] border border-border/60 bg-card/70 lg:h-[560px]" />
                  }
                >
                  <Suspense
                    fallback={
                      <div className="h-[390px] animate-pulse rounded-[1.5rem] border border-border/60 bg-card/70 lg:h-[560px]" />
                    }
                  >
                    <NearbyMap
                      center={{ lat: searchCenter.lat, lng: searchCenter.lng }}
                      userLocation={
                        location
                          ? { lat: location.lat, lng: location.lng, accuracy: location.accuracy }
                          : null
                      }
                      places={filteredPlaces}
                      selectedPlaceId={selectedPlaceId}
                      onSelectPlace={(id) => setSelectedPlaceId(id || null)}
                      route={route}
                    />
                  </Suspense>
                </ClientOnly>

                {selectedPlace && (
                  <section
                    aria-label="Route to selected facility"
                    className="absolute bottom-3 left-3 right-3 z-20 rounded-2xl border border-white/40 bg-background/95 p-3 shadow-xl backdrop-blur-md sm:left-4 sm:right-auto sm:w-[min(480px,calc(100%-2rem))] sm:p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-foreground"
                        style={{
                          backgroundColor: `${HELP_KIND_COLOR[helpKind(selectedPlace.type, selectedPlace.name)]}22`,
                        }}
                      >
                        <FacilityIcon type={selectedPlace.type} name={selectedPlace.name} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-black">{selectedPlace.name}</p>
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {routeLoading
                            ? "Finding a route…"
                            : route
                              ? `${formatDistance(route.distance_m)} · ${formatEta(route.duration_s)} ${routeMode === "walk" ? "walking" : "driving"}`
                              : routeError
                                ? routeError
                                : location
                                  ? "Route information is loading"
                                  : "Share live location for an in-app route"}
                        </p>
                        {route?.nextManeuver && (
                          <p className="mt-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                            {route.nextManeuver}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label="Clear selected facility"
                        onClick={() => setSelectedPlaceId(null)}
                        className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <div
                        className="inline-flex rounded-full border border-border/60 bg-muted/40 p-0.5"
                        role="group"
                        aria-label="Travel mode"
                      >
                        {(["drive", "walk"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            aria-pressed={routeMode === mode}
                            onClick={() => setRouteMode(mode)}
                            className={`inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold ${routeMode === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                          >
                            {mode === "drive" ? (
                              <Navigation2 className="h-3 w-3" />
                            ) : (
                              <Footprints className="h-3 w-3" />
                            )}
                            {mode === "drive" ? "Drive" : "Walk"}
                          </button>
                        ))}
                      </div>
                      {selectedPlace.phone && (
                        <a
                          href={`tel:${selectedPlace.phone.replace(/[^\d+]/g, "")}`}
                          className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 text-[10px] font-bold hover:bg-muted"
                        >
                          <Phone className="h-3 w-3" /> Call
                        </a>
                      )}
                      <a
                        href={directionsUrl(location, selectedPlace, routeMode)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-[10px] font-bold text-white hover:bg-emerald-700"
                      >
                        <Navigation2 className="h-3 w-3" /> Voice navigation
                      </a>
                    </div>
                  </section>
                )}
              </div>
            ) : (
              <div className="grid min-h-[320px] place-items-center rounded-[1.5rem] border border-dashed border-border/70 bg-card/60 p-8 text-center">
                <div>
                  <Crosshair className="mx-auto h-8 w-8 text-primary" />
                  <h2 className="mt-3 text-sm font-bold">
                    {locating ? "Getting your live location" : "Choose an area to browse"}
                  </h2>
                  <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-muted-foreground">
                    Allow GPS for nearby results, or search a Uganda suburb, town, or major road
                    above.
                  </p>
                </div>
              </div>
            )}
          </section>

          <section
            aria-label="Nearby facility directory"
            className="min-w-0 rounded-[1.5rem] border border-border/60 bg-card/65 p-3.5 shadow-sm backdrop-blur sm:p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Facility directory
                </p>
                <h2 className="mt-1 text-base font-black">
                  {visibleArea ? `Near ${visibleArea.name}` : "Closest help"}
                </h2>
              </div>
              <span className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
                {filteredPlaces.length} found
              </span>
            </div>

            {(livePlacesQuery.isLoading || isLoading) && filteredPlaces.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-24 animate-pulse rounded-2xl border border-border/50 bg-background/50"
                  />
                ))}
              </div>
            ) : filteredPlaces.length === 0 ? (
              <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-border/70 bg-background/40 p-5 text-center">
                <div>
                  <MapPin className="mx-auto h-7 w-7 text-muted-foreground/50" />
                  <p className="mt-2 text-[12px] font-bold">
                    {livePlacesQuery.isError
                      ? "Nearby places are unavailable"
                      : "No matching facilities found"}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {search
                      ? "Try another search or category."
                      : "Try a different area, or retry your location."}
                  </p>
                  {livePlacesQuery.isError && (
                    <button
                      type="button"
                      onClick={() => void livePlacesQuery.refetch()}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[10px] font-bold"
                    >
                      <RefreshCw className="h-3 w-3" /> Retry search
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="max-h-[680px] space-y-2 overflow-y-auto pr-1">
                {filteredPlaces.map((facility) => {
                  const kind = helpKind(facility.type, facility.name);
                  const selected = selectedPlaceId === facility.id;
                  const detail =
                    kind === "clinic" || kind === "pharmacy"
                      ? kind === "clinic"
                        ? "Clinic"
                        : "Pharmacy"
                      : TYPE_LABELS[facility.type] || facility.type.replace(/_/g, " ");
                  const status =
                    facility.source === "seeded" && facility.open_now
                      ? "Open 24/7"
                      : facility.open_now === true
                        ? "Open now"
                        : facility.open_now === false
                          ? "Reported closed"
                          : /referral/i.test(facility.name)
                            ? "Referral hospital"
                            : /division/i.test(facility.name)
                              ? "Police division"
                              : null;
                  return (
                    <article
                      key={facility.id}
                      className={`rounded-2xl border p-3 transition ${selected ? "border-emerald-500/45 bg-emerald-500/[0.06] shadow-sm" : "border-border/60 bg-background/55 hover:border-border hover:bg-background"}`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedPlaceId(facility.id)}
                        aria-pressed={selected}
                        className="flex w-full items-start gap-3 text-left"
                      >
                        <span
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                          style={{
                            backgroundColor: `${HELP_KIND_COLOR[kind]}22`,
                            color: HELP_KIND_COLOR[kind],
                          }}
                        >
                          <FacilityIcon type={facility.type} name={facility.name} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-black">
                            {facility.name}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                            {facility.address || detail}
                          </span>
                          <span className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span
                              className="rounded-full px-2 py-0.5 text-[9px] font-bold capitalize"
                              style={{
                                color: HELP_KIND_COLOR[kind],
                                backgroundColor: `${HELP_KIND_COLOR[kind]}18`,
                              }}
                            >
                              {detail}
                            </span>
                            {status && (
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold ${facility.open_now === false ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}
                              >
                                <Clock className="h-2.5 w-2.5" />
                                {status}
                              </span>
                            )}
                            <span className="ml-auto text-[10px] font-bold text-foreground">
                              {formatDistance(facility.distance_m)}
                            </span>
                          </span>
                        </span>
                      </button>
                      <div className="mt-2.5 grid grid-cols-2 gap-2">
                        {facility.phone ? (
                          <a
                            href={`tel:${facility.phone.replace(/[^\d+]/g, "")}`}
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-border/70 bg-card text-[10px] font-bold hover:bg-muted"
                          >
                            <Phone className="h-3 w-3" /> Call facility
                          </a>
                        ) : (
                          <span className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border/50 bg-muted/20 text-[9px] font-semibold text-muted-foreground">
                            No verified phone
                          </span>
                        )}
                        <a
                          href={directionsUrl(location, facility, routeMode)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-foreground text-[10px] font-bold text-background hover:opacity-85"
                        >
                          <Navigation2 className="h-3 w-3" /> Navigate
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {isError && filteredPlaces.length === 0 && (
              <p className="mt-3 text-center text-[9px] text-muted-foreground">
                Showing saved facilities when available. Map listings may need an internet
                connection.
              </p>
            )}
          </section>
        </div>

        <div className="mb-8 rounded-[1.6rem] border border-border/60 bg-card/75 p-4 shadow-soft">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                Neighbours nearby
              </p>
              <h2 className="mt-1 font-display text-xl font-black">Active members</h2>
            </div>
            <span className="rounded-full border border-border/60 bg-background/50 px-2.5 py-1 text-[10.5px] font-semibold text-muted-foreground">
              {nearbyMembersQuery.data?.length ?? 0} nearby
            </span>
          </div>

          {!hasLocation ? (
            <div className="rounded-[1.1rem] border border-dashed border-border/60 bg-background/40 p-4 text-[12px] text-muted-foreground">
              Allow live location to check whether nearby members have opted in to share their
              presence.
            </div>
          ) : nearbyMembersQuery.isLoading ? (
            <div className="rounded-[1.1rem] border border-dashed border-border/60 bg-background/40 p-4 text-[12px] text-muted-foreground">
              Checking for nearby members…
            </div>
          ) : nearbyMembersQuery.data && nearbyMembersQuery.data.length > 0 ? (
            <div className="space-y-3">
              {nearbyMembersQuery.data.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center justify-between gap-3 rounded-[1.1rem] border border-border/60 bg-background/50 p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {member.avatar_url ? (
                        <img
                          src={member.avatar_url}
                          alt={member.full_name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        member.full_name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[13px] font-semibold">{member.full_name}</p>
                        {member.phone_verified && (
                          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDistance(member.distance_m)} away
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={sendingRequestId === member.user_id}
                    onClick={() => void handleSendRequest(member.user_id)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                  >
                    {sendingRequestId === member.user_id ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="h-3.5 w-3.5" />
                    )}
                    {member.relationship_state === "connected" ? "Connected" : "Send request"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[1.1rem] border border-dashed border-border/60 bg-background/40 p-4 text-[12px] text-muted-foreground">
              No one nearby has opted in to share their presence right now.
            </div>
          )}
        </div>

        <p className="mb-2 text-center text-[10px] text-muted-foreground">
          Facility hours and phone details come from listing data and may not be current. Confirm
          before travelling when possible.
        </p>
      </div>
    </AppShell>
  );
}
