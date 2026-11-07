import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Building2,
  Car,
  ChevronDown,
  CornerUpLeft,
  CornerUpRight,
  ExternalLink,
  Flag,
  Flame,
  Footprints,
  HeartPulse,
  LocateFixed,
  Maximize2,
  Minimize2,
  Navigation,
  RefreshCw,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OsmTileMap } from "@/components/allma/live-location-map";
import {
  HELP_KIND_COLOR,
  helpKind,
  type HelpKind,
  type HelpPlace,
} from "@/components/allma/nearby-help-list";
import { getGoogleMapsBrowserKey, googleMapsAuthFailed, loadGoogleMaps, onGoogleMapsAuthFailure } from "@/lib/google-maps-loader";
import { nearbyMarkerDataUrl } from "@/lib/nearby-marker";

type Pt = { lat: number; lng: number };
type Mode = "drive" | "walk";
type Step = { instruction: string; distance: number; type: string; modifier?: string; location?: Pt };
type Route = { coords: Pt[]; distance: number; duration: number; steps: Step[] };

const TILE = 256;
const tx = (lng: number, z: number) => ((lng + 180) / 360) * 2 ** z;
const ty = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

function haversine(a: Pt, b: Pt) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`;
}
export function formatDuration(s: number) {
  const min = Math.max(1, Math.round(s / 60));
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

function describeStep(step: any, destinationName: string): Step {
  const m = step.maneuver ?? {};
  const road = step.name ? ` onto ${step.name}` : "";
  const mod = (m.modifier as string | undefined)?.replace("slight ", "slightly ").replace("sharp ", "sharply ");
  let instruction: string;
  switch (m.type) {
    case "depart": instruction = `Head out${step.name ? ` on ${step.name}` : ""}`; break;
    case "arrive": instruction = `Arrive at ${destinationName}`; break;
    case "roundabout":
    case "rotary": instruction = `At the roundabout, take exit ${m.exit ?? ""}${road}`.replace("  ", " "); break;
    case "continue":
    case "new name": instruction = `Continue${road || " straight"}`; break;
    default: instruction = mod ? `Turn ${mod}${road}` : `Continue${road}`;
  }
  const location = Array.isArray(m.location) && m.location.length >= 2
    ? { lat: Number(m.location[1]), lng: Number(m.location[0]) }
    : undefined;
  return { instruction, distance: step.distance ?? 0, type: m.type ?? "", modifier: m.modifier, location };
}

async function fetchRoute(
  from: Pt,
  to: Pt,
  mode: Mode,
  signal: AbortSignal,
  destinationName: string,
): Promise<Route> {
  const base = mode === "drive" ? "https://routing.openstreetmap.de/routed-car/route/v1/driving" : "https://routing.openstreetmap.de/routed-foot/route/v1/foot";
  const url = `${base}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Route service returned ${res.status}`);
  const data = await res.json();
  const r = data.routes?.[0];
  if (!r) throw new Error("No route found to the caller");
  return {
    coords: (r.geometry.coordinates as [number, number][]).map(([lng, lat]) => ({ lat, lng })),
    distance: r.distance,
    duration: r.duration,
    steps: (r.legs?.[0]?.steps ?? []).map((step: unknown) =>
      describeStep(step, destinationName),
    ),
  };
}

function StepIcon({ step, className }: { step?: Step; className?: string }) {
  if (!step) return <Navigation className={className} />;
  if (step.type === "arrive") return <Flag className={className} />;
  if (step.modifier?.includes("left")) return <CornerUpLeft className={className} />;
  if (step.modifier?.includes("right")) return <CornerUpRight className={className} />;
  return <ArrowUp className={className} />;
}

function GoogleRouteCanvas({
  me,
  caller,
  route,
  onFail,
  callerName,
  medical,
  fallbackCenter,
  searchCenter,
  anchorLocation,
  helpPlaces,
  selectedPlaceId,
  onSelectPlace,
}: {
  me: Pt | null;
  caller: Pt | null;
  route: Route | null;
  onFail: () => void;
  callerName: string;
  medical: boolean;
  fallbackCenter: Pt;
  searchCenter: Pt;
  anchorLocation: Pt | null;
  helpPlaces?: HelpPlace[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapsRef = useRef<any>(null);
  const navigationLayers = useRef<any[]>([]);
  const placeLayers = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const fitted = useRef<string | null>(null);
  const hasHelpPlaces = Boolean(helpPlaces);
  const selectPlaceRef = useRef(onSelectPlace);
  selectPlaceRef.current = onSelectPlace;

  useEffect(() => {
    let cancelled = false;
    const unsub = onGoogleMapsAuthFailure(() => !cancelled && onFail());
    loadGoogleMaps().then((maps) => {
      if (cancelled || !ref.current) return;
      mapRef.current = new maps.Map(ref.current, { center: searchCenter ?? anchorLocation ?? caller ?? me ?? fallbackCenter, zoom: 14, maxZoom: 15, disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy", clickableIcons: false });
      mapsRef.current = maps;
      setReady(true);
    }).catch(() => !cancelled && onFail());
    return () => { cancelled = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fitKey = [
    searchCenter.lat.toFixed(3),
    searchCenter.lng.toFixed(3),
    anchorLocation ? `${anchorLocation.lat.toFixed(3)},${anchorLocation.lng.toFixed(3)}` : "",
    me ? `${me.lat.toFixed(3)},${me.lng.toFixed(3)}` : "",
    route
      ? `${route.coords.length}:${route.coords[0]?.lat.toFixed(3)}:${route.coords[route.coords.length - 1]?.lng.toFixed(3)}`
      : "",
    (helpPlaces ?? [])
      .map((place) => `${place.id}:${place.latitude.toFixed(3)},${place.longitude.toFixed(3)}`)
      .join(","),
    selectedPlaceId ?? "",
  ].join("|");

  useEffect(() => {
    const maps = mapsRef.current, map = mapRef.current;
    if (!ready || !maps || !map) return;
    navigationLayers.current.forEach((layer) => layer.setMap(null));
    const next: any[] = [];
    if (route) {
      next.push(new maps.Polyline({ map, path: route.coords, strokeColor: "#1a73e8", strokeOpacity: 0.95, strokeWeight: 6 }));
    }
    if (caller && !hasHelpPlaces) {
      const marker = new maps.Marker({
        map,
        position: caller,
        title: callerName,
        icon: medical
          ? {
              url: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="8" fill="#10b981" opacity=".24"><animate attributeName="r" values="8;20" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values=".35;0" dur="1.6s" repeatCount="indefinite"/></circle><circle cx="22" cy="22" r="9" fill="#10b981" stroke="#fff" stroke-width="3"/><path d="M20 15h4v5h5v4h-5v5h-4v-5h-5v-4h5z" fill="#fff"/></svg>`)}`,
              scaledSize: new maps.Size(44, 44),
              anchor: new maps.Point(22, 22),
            }
          : { path: maps.SymbolPath.CIRCLE, scale: 9, fillColor: "#e5383b", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3 },
      });
      next.push(marker);
    }
    if (anchorLocation) {
      next.push(new maps.Marker({
        map,
        position: anchorLocation,
        title: callerName,
        icon: { path: maps.SymbolPath.CIRCLE, scale: 9, fillColor: "#e5383b", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3 },
        zIndex: 5,
      }));
    }
    if (me) next.push(new maps.Marker({ map, position: me, title: "You", icon: { path: maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#1a73e8", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3 } }));
    navigationLayers.current = next;
    return () => {
      next.forEach((layer) => layer.setMap(null));
    };
  }, [ready, me, caller, route, callerName, medical, anchorLocation, hasHelpPlaces]);

  useEffect(() => {
    const maps = mapsRef.current, map = mapRef.current;
    if (!ready || !maps || !map) return;
    placeLayers.current.forEach((layer) => layer.setMap(null));
    const next: any[] = [];
    (helpPlaces ?? []).forEach((place) => {
      const kind = helpKind(place.type);
      const marker = new maps.Marker({
        map,
        position: { lat: place.latitude, lng: place.longitude },
        title: `${place.name} · ${kind}`,
        icon: {
          url: nearbyMarkerDataUrl(kind, HELP_KIND_COLOR[kind]),
          scaledSize: new maps.Size(48, 48),
          anchor: new maps.Point(24, 24),
        },
        zIndex: selectedPlaceId === place.id ? 10 : 2,
      });
      marker.addListener("click", () => selectPlaceRef.current(place.id));
      next.push(marker);
    });
    placeLayers.current = next;
    return () => {
      next.forEach((layer) => layer.setMap(null));
    };
  }, [ready, helpPlaces, selectedPlaceId]);

  useEffect(() => {
    const maps = mapsRef.current, map = mapRef.current;
    if (!ready || !maps || !map || fitted.current === fitKey) return;
    const bounds = new maps.LatLngBounds();
    const points = [
      ...(route?.coords ?? []),
      ...(me ? [me] : []),
      ...(anchorLocation ? [anchorLocation] : []),
      searchCenter,
      ...(caller && !helpPlaces ? [caller] : []),
      ...(helpPlaces ?? []).map((place) => ({ lat: place.latitude, lng: place.longitude })),
    ];
    points.forEach((point) => bounds.extend(point));
    if (points.length > 1) map.fitBounds(bounds, 40);
    fitted.current = fitKey;
  }, [ready, fitKey, route, me, anchorLocation, searchCenter, caller, helpPlaces]);

  return <div ref={ref} className="absolute inset-0" />;
}

function OsmRouteCanvas({
  me,
  caller,
  route,
  medical,
  fallbackCenter,
  searchCenter,
  anchorLocation,
  helpPlaces,
  selectedPlaceId,
  onSelectPlace,
}: {
  me: Pt | null;
  caller: Pt | null;
  route: Route | null;
  medical: boolean;
  fallbackCenter: Pt;
  searchCenter: Pt;
  anchorLocation: Pt | null;
  helpPlaces?: HelpPlace[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 640, h: 320 });
  useEffect(() => {
    const n = wrap.current; if (!n) return;
    const m = () => { const r = n.getBoundingClientRect(); if (r.width && r.height) setSize({ w: r.width, h: r.height }); };
    m(); const o = new ResizeObserver(m); o.observe(n); return () => o.disconnect();
  }, []);
  const pts = route?.coords ?? [me, ...(caller ? [caller] : [])].filter((point): point is Pt => Boolean(point));
  const all = [
    ...pts,
    ...(caller && !helpPlaces ? [caller] : []),
    ...(me ? [me] : []),
    ...(anchorLocation ? [anchorLocation] : []),
    searchCenter,
    ...(helpPlaces ?? []).map((place) => ({ lat: place.latitude, lng: place.longitude })),
    fallbackCenter,
  ];
  const minLat = Math.min(...all.map((p) => p.lat)), maxLat = Math.max(...all.map((p) => p.lat));
  const minLng = Math.min(...all.map((p) => p.lng)), maxLng = Math.max(...all.map((p) => p.lng));
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  let z = 15;
  while (z > 3) {
    const w = (tx(maxLng, z) - tx(minLng, z)) * TILE, h = (ty(minLat, z) - ty(maxLat, z)) * TILE;
    if (w < size.w - 60 && h < size.h - 60) break;
    z -= 1;
  }
  const proj = (p: Pt) => ({ x: size.w / 2 + (tx(p.lng, z) - tx(center.lng, z)) * TILE, y: size.h / 2 + (ty(p.lat, z) - ty(center.lat, z)) * TILE });
  const path = route ? route.coords.map(proj).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") : "";
  const c = caller && !helpPlaces ? proj(caller) : null;
  const m = me ? proj(me) : null;
  const a = anchorLocation ? proj(anchorLocation) : null;
  return (
    <div ref={wrap} className="absolute inset-0">
      <OsmTileMap lat={center.lat} lng={center.lng} zoom={z} />
      <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h}>
        {path && <polyline points={path} fill="none" stroke="hsl(var(--background))" strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />}
        {path && <polyline points={path} fill="none" stroke="#1a73e8" strokeWidth={5.5} strokeLinejoin="round" strokeLinecap="round" />}
        {!route && m && c && <line x1={m.x} y1={m.y} x2={c.x} y2={c.y} stroke="#1a73e8" strokeWidth={3} strokeDasharray="6 6" />}
        {m && <circle cx={m.x} cy={m.y} r={8} fill="#1a73e8" stroke="#fff" strokeWidth={3} />}
        {a && <circle cx={a.x} cy={a.y} r={9} fill="#e5383b" stroke="#fff" strokeWidth={3} />}
        {c && medical && <>
          <circle cx={c.x} cy={c.y} r={9} fill="#10b981" opacity={0.3}><animate attributeName="r" values="8;22" dur="1.6s" repeatCount="indefinite" /><animate attributeName="opacity" values=".35;0" dur="1.6s" repeatCount="indefinite" /></circle>
          <circle cx={c.x} cy={c.y} r={9} fill="#10b981" stroke="#fff" strokeWidth={3} />
          <path d={`M${c.x - 2} ${c.y - 6}h4v4h4v4h-4v4h-4v-4h-4v-4h4z`} fill="#fff" />
        </>}
        {c && !medical && <>
          <circle cx={c.x} cy={c.y} r={16} fill="#e5383b" opacity={0.2}><animate attributeName="r" values="10;20;10" dur="1.6s" repeatCount="indefinite" /></circle>
          <circle cx={c.x} cy={c.y} r={8} fill="#e5383b" stroke="#fff" strokeWidth={3} />
        </>}
      </svg>
      {(helpPlaces ?? []).map((place) => {
        const point = proj({ lat: place.latitude, lng: place.longitude });
        const kind = helpKind(place.type);
        const active = selectedPlaceId === place.id;
        return (
          <button
            key={place.id}
            type="button"
            aria-label={`${place.name}, ${kind}`}
            aria-pressed={active}
            title={`${place.name} · ${kind}`}
            onClick={() => onSelectPlace(place.id)}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            style={{ left: point.x, top: point.y }}
          >
            <img
              src={nearbyMarkerDataUrl(kind, HELP_KIND_COLOR[kind])}
              alt=""
              aria-hidden="true"
              className={cn("h-12 w-12 drop-shadow-sm", active && "scale-110")}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Live turn-by-turn route from the user's GPS to a caller or nearby help facility. */
export function ResponderNavigation({
  caller,
  callerName = "the caller",
  helpPlaces,
  selectedPlaceId,
  searchCenter,
  anchorLocation = null,
  helpLoading = false,
  initialLocation,
  currentLocation,
  trackLocation = true,
  onSelectDestination,
}: {
  caller: Pt;
  callerName?: string;
  helpPlaces?: HelpPlace[];
  selectedPlaceId?: string | null;
  searchCenter?: Pt | null;
  anchorLocation?: Pt | null;
  helpLoading?: boolean;
  initialLocation?: Pt;
  currentLocation?: Pt;
  trackLocation?: boolean;
  onSelectDestination?: (id: string | null) => void;
}) {
  const [me, setMe] = useState<Pt | null>(initialLocation ?? null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("drive");
  const [helpKindSelected, setHelpKindSelected] = useState<HelpKind>("hospital");
  const [localSelectedPlaceId, setLocalSelectedPlaceId] = useState<string | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [full, setFull] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [stepsOpen, setStepsOpen] = useState(false);
  const anchor = useRef<{ me: Pt; caller: Pt; mode: Mode; nonce: number } | null>(null);
  const routeRequest = useRef<AbortController | null>(null);
  const useGoogle = Boolean(getGoogleMapsBrowserKey()) && !googleFailed && !googleMapsAuthFailed();
  const currentLat = currentLocation?.lat;
  const currentLng = currentLocation?.lng;
  const reference = searchCenter ?? me ?? initialLocation ?? caller;
  const activeSelectedPlaceId =
    selectedPlaceId === undefined ? localSelectedPlaceId : selectedPlaceId;
  const selectedPlaces = useMemo(
    () => (helpPlaces ?? []).filter((place) => helpKind(place.type) === helpKindSelected),
    [helpPlaces, helpKindSelected],
  );
  const destinationPlace = useMemo(
    () => {
      const explicit = helpPlaces?.find((place) => place.id === activeSelectedPlaceId);
      return explicit ?? [...selectedPlaces].sort(
        (a, b) =>
          haversine(reference, { lat: a.latitude, lng: a.longitude }) -
          haversine(reference, { lat: b.latitude, lng: b.longitude }),
      )[0] ?? null;
    },
    [activeSelectedPlaceId, helpPlaces, reference, selectedPlaces],
  );
  const destination = useMemo(
    () =>
      helpPlaces
        ? destinationPlace
          ? { lat: destinationPlace.latitude, lng: destinationPlace.longitude }
          : null
        : caller,
    [caller, destinationPlace, helpPlaces],
  );
  const destinationLabel = destinationPlace?.name ?? callerName;
  const destinationKind = destinationPlace ? helpKind(destinationPlace.type) : null;
  const isMedical = destinationKind === "hospital" || destinationKind === "clinic";
  const destinationId = destinationPlace?.id;

  const selectPlace = (id: string | null) => {
    if (selectedPlaceId === undefined) setLocalSelectedPlaceId(id);
    const place = helpPlaces?.find((item) => item.id === id);
    if (place) setHelpKindSelected(helpKind(place.type));
    onSelectDestination?.(id);
  };

  useEffect(() => {
    if (destinationId) onSelectDestination?.(destinationId);
  }, [destinationId, onSelectDestination]);

  useEffect(() => {
    if (!selectedPlaceId) return;
    const place = helpPlaces?.find((item) => item.id === selectedPlaceId);
    if (place) setHelpKindSelected(helpKind(place.type));
  }, [helpPlaces, selectedPlaceId]);

  useEffect(() => {
    if (currentLat !== undefined && currentLng !== undefined) {
      setMe({ lat: currentLat, lng: currentLng });
      setGpsError(null);
    }
  }, [currentLat, currentLng]);

  useEffect(() => {
    if (!trackLocation) return;
    if (!navigator.geolocation) { setGpsError("This device can't share its location."); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => { setGpsError(null); setMe({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      (e) => setGpsError(e.code === 1 ? "Allow location access to get live directions." : "Couldn't get your live location yet."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [trackLocation]);

  // Ordinary renders/GPS fixes must not cancel a request that is still loading.
  useEffect(() => () => {
    routeRequest.current?.abort();
    routeRequest.current = null;
    anchor.current = null;
  }, []);

  // Re-route when you move ~40 m, the destination moves ~40 m, or travel mode changes.
  useEffect(() => {
    if (!me || !destination) {
      routeRequest.current?.abort();
      routeRequest.current = null;
      anchor.current = null;
      setRoute(null);
      setRouteError(null);
      setLoading(false);
      return;
    }
    const a = anchor.current;
    if (a && a.mode === mode && a.nonce === nonce && haversine(a.me, me) < 40 && haversine(a.caller, destination) < 40) return;
    routeRequest.current?.abort();
    anchor.current = { me, caller: destination, mode, nonce };
    const ctrl = new AbortController();
    routeRequest.current = ctrl;
    setLoading(true);
    fetchRoute(me, destination, mode, ctrl.signal, destinationLabel)
      .then((r) => { if (!ctrl.signal.aborted) { setRoute(r); setRouteError(null); } })
      .catch((e) => { if (!ctrl.signal.aborted) setRouteError(e instanceof Error ? e.message : "Route unavailable"); })
      .finally(() => !ctrl.signal.aborted && setLoading(false));
  }, [me, destination, mode, nonce]);

  const nextStep = useMemo(() => route?.steps.find((s, i) => i > 0) ?? route?.steps[0], [route]);
  useEffect(() => {
    setActiveStepIndex(route && route.steps.length > 1 ? 1 : 0);
  }, [route]);
  useEffect(() => {
    if (!me || !route) return;
    const step = route.steps[activeStepIndex];
    if (
      step?.location &&
      haversine(me, step.location) <= 35 &&
      activeStepIndex < route.steps.length - 1
    ) {
      setActiveStepIndex((index) => Math.min(route.steps.length - 1, index + 1));
    }
  }, [activeStepIndex, me, route]);
  const activeStep = route?.steps[activeStepIndex] ?? nextStep;
  const distanceToStep = me && activeStep?.location
    ? haversine(me, activeStep.location)
    : activeStep?.distance;
  const straight = me && destination ? haversine(me, destination) : null;
  const gmaps = destination
    ? `https://www.google.com/maps/dir/?api=1${me ? `&origin=${me.lat},${me.lng}` : ""}&destination=${destination.lat},${destination.lng}&travelmode=${mode === "drive" ? "driving" : "walking"}&dir_action=navigate`
    : null;
  const helpCategories = [
    { kind: "hospital", label: "Nearest Hospital 🏥", Icon: Building2 },
    { kind: "police", label: "Nearest Police 🚓", Icon: Shield },
    { kind: "clinic", label: "Nearest Clinic 🩺", Icon: HeartPulse },
    { kind: "fire", label: "Fire & Rescue 🚒", Icon: Flame },
    { kind: "pharmacy", label: "Nearest Pharmacy", Icon: HeartPulse },
  ] as const;
  const noDestinationMessage =
    helpPlaces && !destinationPlace
      ? helpLoading
        ? "Finding nearby help facilities…"
        : `No nearby ${helpKindSelected} was found. Try another help type or use your local emergency number.`
      : gpsError ?? (me ? (routeError ? `Route unavailable to ${destinationLabel}.` : "Finding the fastest route…") : "Getting your location…");

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border/70 bg-card shadow-soft", full && "fixed inset-0 z-[90] flex flex-col rounded-none border-0")}>
      {helpPlaces && (
        <div className="border-b border-border/60 p-3 sm:p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Navigate to nearby help</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {helpCategories.map(({ kind, label, Icon }) => {
              const available = helpPlaces.some((place) => helpKind(place.type) === kind);
              const active = helpKindSelected === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  disabled={!available}
                  aria-pressed={active}
                  onClick={() => {
                    setHelpKindSelected(kind);
                    selectPlace(null);
                  }}
                  className={cn(
                    "flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center text-[10px] font-bold leading-tight transition sm:flex-row sm:text-[11px]",
                    active ? "border-success/50 bg-success/10 text-success" : "border-border/60 bg-background text-foreground",
                    !available && "cursor-not-allowed opacity-45",
                  )}
                  title={available ? label : `No nearby ${kind} found`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
          {destinationPlace && (
            <p className="mt-2 truncate text-[11px] font-semibold text-muted-foreground">
              Routing to {destinationPlace.name} · {formatDistance(haversine(reference, { lat: destinationPlace.latitude, lng: destinationPlace.longitude }))}
            </p>
          )}
        </div>
      )}

      {/* Next-turn banner */}
      <div role="status" aria-live="polite" className="flex items-center gap-3 bg-success px-4 py-3 text-success-foreground">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-success-foreground/15"><StepIcon step={activeStep} className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          {activeStep ? <>
            <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">In {formatDistance(distanceToStep ?? activeStep.distance)}</p>
            <p className="truncate text-[15px] font-bold">{activeStep.instruction}</p>
          </> : <p className="text-[14px] font-bold">{noDestinationMessage}</p>}
        </div>
        <button type="button" onClick={() => setFull((v) => !v)} aria-label={full ? "Exit full screen" : "Full screen navigation"} className="grid h-9 w-9 place-items-center rounded-lg bg-success-foreground/15">
          {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      <div className={cn("relative bg-muted", full ? "flex-1" : "h-64 sm:h-80")}>
        {useGoogle ? (
          <GoogleRouteCanvas
            me={me}
            caller={destination}
            route={route}
            onFail={() => setGoogleFailed(true)}
            callerName={destinationLabel}
            medical={isMedical}
            fallbackCenter={reference}
            searchCenter={searchCenter ?? caller}
            anchorLocation={anchorLocation}
            helpPlaces={helpPlaces}
            selectedPlaceId={destinationId ?? activeSelectedPlaceId}
            onSelectPlace={selectPlace}
          />
        ) : (
          <OsmRouteCanvas
            me={me}
            caller={destination}
            route={route}
            medical={isMedical}
            fallbackCenter={reference}
            searchCenter={searchCenter ?? caller}
            anchorLocation={anchorLocation}
            helpPlaces={helpPlaces}
            selectedPlaceId={destinationId ?? activeSelectedPlaceId}
            onSelectPlace={selectPlace}
          />
        )}
        <div className="absolute left-2.5 top-2.5 flex overflow-hidden rounded-full border border-border/60 bg-background/90 text-[11px] font-bold shadow-sm backdrop-blur">
          {(["drive", "walk"] as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={cn("flex items-center gap-1 px-3 py-1.5", mode === m ? "bg-primary text-primary-foreground" : "text-foreground")}>
              {m === "drive" ? <Car className="h-3.5 w-3.5" /> : <Footprints className="h-3.5 w-3.5" />}{m === "drive" ? "Drive" : "Walk"}
            </button>
          ))}
        </div>
        {loading && <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-[10px] font-semibold"><RefreshCw className="h-3 w-3 animate-spin" /> Updating route</span>}
      </div>

      {/* ETA bar */}
      <div className="flex items-center gap-3 border-t border-border/60 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[20px] font-extrabold leading-none text-success">{route ? formatDuration(route.duration) : "—"}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {route ? `${formatDistance(route.distance)} to ${destinationLabel}` : straight !== null ? `${formatDistance(straight)} away in a straight line` : helpPlaces && !destinationPlace ? "No matching facility found nearby" : "Waiting for your GPS"}
          </p>
        </div>
        <button type="button" onClick={() => { anchor.current = null; setNonce((n) => n + 1); }} aria-label="Recalculate route" className="grid h-10 w-10 place-items-center rounded-xl border border-border/70"><LocateFixed className="h-4 w-4" /></button>
        {gmaps ? (
          <a href={gmaps} target="_blank" rel="noreferrer" className="flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-[12px] font-bold text-primary-foreground"><ExternalLink className="h-3.5 w-3.5" /> Voice navigation</a>
        ) : (
          <button type="button" disabled className="flex h-10 items-center gap-1.5 rounded-xl bg-muted px-3.5 text-[12px] font-bold text-muted-foreground"><ExternalLink className="h-3.5 w-3.5" /> Voice navigation</button>
        )}
      </div>

      {route && route.steps.length > 1 && (
        <section className="border-t border-border/60">
          <button
            type="button"
            onClick={() => setStepsOpen((open) => !open)}
            aria-expanded={stepsOpen}
            className="flex min-h-11 w-full items-center justify-between px-4 text-left text-[12px] font-bold"
          >
            <span>{stepsOpen ? "Hide" : "Show"} turn-by-turn steps · {route.steps.length}</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", stepsOpen && "rotate-180")} />
          </button>
          {stepsOpen && (
            <ol className={cn("divide-y divide-border/60 overflow-y-auto", full ? "max-h-[30vh]" : "max-h-44")}>
              {route.steps.map((s, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <StepIcon step={s} className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{s.instruction}</span>
                  <span className="text-[11px] text-muted-foreground">{s.distance > 0 ? formatDistance(s.distance) : ""}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
      <p className="border-t border-border/60 px-4 py-1.5 text-[9.5px] text-muted-foreground">Routes © OpenStreetMap contributors · Drive safely</p>
    </div>
  );
}
