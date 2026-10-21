import { useEffect, useMemo, useRef, useState } from "react";
import { Car, CornerUpLeft, CornerUpRight, ExternalLink, Footprints, LocateFixed, Maximize2, Minimize2, Navigation, RefreshCw, ArrowUp, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { OsmTileMap } from "@/components/allma/live-location-map";
import { getGoogleMapsBrowserKey, googleMapsAuthFailed, loadGoogleMaps, onGoogleMapsAuthFailure } from "@/lib/google-maps-loader";

type Pt = { lat: number; lng: number };
type Mode = "drive" | "walk";
type Step = { instruction: string; distance: number; type: string; modifier?: string };
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

function describeStep(step: any): Step {
  const m = step.maneuver ?? {};
  const road = step.name ? ` onto ${step.name}` : "";
  const mod = (m.modifier as string | undefined)?.replace("slight ", "slightly ").replace("sharp ", "sharply ");
  let instruction: string;
  switch (m.type) {
    case "depart": instruction = `Head out${step.name ? ` on ${step.name}` : ""}`; break;
    case "arrive": instruction = "Arrive at the caller's location"; break;
    case "roundabout":
    case "rotary": instruction = `At the roundabout, take exit ${m.exit ?? ""}${road}`.replace("  ", " "); break;
    case "continue":
    case "new name": instruction = `Continue${road || " straight"}`; break;
    default: instruction = mod ? `Turn ${mod}${road}` : `Continue${road}`;
  }
  return { instruction, distance: step.distance ?? 0, type: m.type ?? "", modifier: m.modifier };
}

async function fetchRoute(from: Pt, to: Pt, mode: Mode, signal: AbortSignal): Promise<Route> {
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
    steps: (r.legs?.[0]?.steps ?? []).map(describeStep),
  };
}

function StepIcon({ step, className }: { step?: Step; className?: string }) {
  if (!step) return <Navigation className={className} />;
  if (step.type === "arrive") return <Flag className={className} />;
  if (step.modifier?.includes("left")) return <CornerUpLeft className={className} />;
  if (step.modifier?.includes("right")) return <CornerUpRight className={className} />;
  return <ArrowUp className={className} />;
}

function GoogleRouteCanvas({ me, caller, route, onFail }: { me: Pt | null; caller: Pt; route: Route | null; onFail: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapsRef = useRef<any>(null);
  const layers = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const fitted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const unsub = onGoogleMapsAuthFailure(() => !cancelled && onFail());
    loadGoogleMaps().then((maps) => {
      if (cancelled || !ref.current) return;
      mapRef.current = new maps.Map(ref.current, { center: caller, zoom: 15, disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy", clickableIcons: false });
      mapsRef.current = maps;
      setReady(true);
    }).catch(() => !cancelled && onFail());
    return () => { cancelled = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const maps = mapsRef.current, map = mapRef.current;
    if (!ready || !maps || !map) return;
    layers.current.forEach((l) => l.setMap(null));
    const next: any[] = [];
    if (route) {
      next.push(new maps.Polyline({ map, path: route.coords, strokeColor: "#1a73e8", strokeOpacity: 0.95, strokeWeight: 6 }));
    }
    next.push(new maps.Marker({ map, position: caller, title: "Caller", icon: { path: maps.SymbolPath.CIRCLE, scale: 9, fillColor: "#e5383b", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3 } }));
    if (me) next.push(new maps.Marker({ map, position: me, title: "You", icon: { path: maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#1a73e8", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3 } }));
    layers.current = next;
    if (!fitted.current && me) {
      const b = new maps.LatLngBounds();
      (route?.coords ?? [me, caller]).forEach((p) => b.extend(p));
      b.extend(caller); b.extend(me);
      map.fitBounds(b, 40);
      fitted.current = true;
    }
  }, [ready, me, caller, route]);

  return <div ref={ref} className="absolute inset-0" />;
}

function OsmRouteCanvas({ me, caller, route }: { me: Pt | null; caller: Pt; route: Route | null }) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 640, h: 320 });
  useEffect(() => {
    const n = wrap.current; if (!n) return;
    const m = () => { const r = n.getBoundingClientRect(); if (r.width && r.height) setSize({ w: r.width, h: r.height }); };
    m(); const o = new ResizeObserver(m); o.observe(n); return () => o.disconnect();
  }, []);
  const pts = route?.coords ?? (me ? [me, caller] : [caller]);
  const all = [...pts, caller, ...(me ? [me] : [])];
  const minLat = Math.min(...all.map((p) => p.lat)), maxLat = Math.max(...all.map((p) => p.lat));
  const minLng = Math.min(...all.map((p) => p.lng)), maxLng = Math.max(...all.map((p) => p.lng));
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  let z = 17;
  while (z > 3) {
    const w = (tx(maxLng, z) - tx(minLng, z)) * TILE, h = (ty(minLat, z) - ty(maxLat, z)) * TILE;
    if (w < size.w - 60 && h < size.h - 60) break;
    z -= 1;
  }
  const proj = (p: Pt) => ({ x: size.w / 2 + (tx(p.lng, z) - tx(center.lng, z)) * TILE, y: size.h / 2 + (ty(p.lat, z) - ty(center.lat, z)) * TILE });
  const path = route ? route.coords.map(proj).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") : "";
  const c = proj(caller), m = me ? proj(me) : null;
  return (
    <div ref={wrap} className="absolute inset-0">
      <OsmTileMap lat={center.lat} lng={center.lng} zoom={z} />
      <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h}>
        {path && <polyline points={path} fill="none" stroke="hsl(var(--background))" strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />}
        {path && <polyline points={path} fill="none" stroke="#1a73e8" strokeWidth={5.5} strokeLinejoin="round" strokeLinecap="round" />}
        {!route && m && <line x1={m.x} y1={m.y} x2={c.x} y2={c.y} stroke="#1a73e8" strokeWidth={3} strokeDasharray="6 6" />}
        {m && <circle cx={m.x} cy={m.y} r={8} fill="#1a73e8" stroke="#fff" strokeWidth={3} />}
        <circle cx={c.x} cy={c.y} r={16} fill="#e5383b" opacity={0.2}><animate attributeName="r" values="10;20;10" dur="1.6s" repeatCount="indefinite" /></circle>
        <circle cx={c.x} cy={c.y} r={8} fill="#e5383b" stroke="#fff" strokeWidth={3} />
      </svg>
    </div>
  );
}

/** Live turn-by-turn route from the responder's own GPS to the caller's shared location. */
export function ResponderNavigation({ caller, callerName = "the caller" }: { caller: Pt; callerName?: string }) {
  const [me, setMe] = useState<Pt | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("drive");
  const [route, setRoute] = useState<Route | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [full, setFull] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const anchor = useRef<{ me: Pt; caller: Pt; mode: Mode; nonce: number } | null>(null);
  const routeRequest = useRef<AbortController | null>(null);
  const useGoogle = Boolean(getGoogleMapsBrowserKey()) && !googleFailed && !googleMapsAuthFailed();

  useEffect(() => {
    if (!navigator.geolocation) { setGpsError("This device can't share its location."); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => { setGpsError(null); setMe({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      (e) => setGpsError(e.code === 1 ? "Allow location access to get directions to the caller." : "Couldn't get your location yet."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Ordinary renders/GPS fixes must not cancel a request that is still loading.
  useEffect(() => () => {
    routeRequest.current?.abort();
    routeRequest.current = null;
    anchor.current = null;
  }, []);

  // Re-route when you move ~40 m, the caller moves ~40 m, or travel mode changes.
  useEffect(() => {
    if (!me) return;
    const a = anchor.current;
    if (a && a.mode === mode && a.nonce === nonce && haversine(a.me, me) < 40 && haversine(a.caller, caller) < 40) return;
    routeRequest.current?.abort();
    anchor.current = { me, caller, mode, nonce };
    const ctrl = new AbortController();
    routeRequest.current = ctrl;
    setLoading(true);
    fetchRoute(me, caller, mode, ctrl.signal)
      .then((r) => { if (!ctrl.signal.aborted) { setRoute(r); setRouteError(null); } })
      .catch((e) => { if (!ctrl.signal.aborted) setRouteError(e instanceof Error ? e.message : "Route unavailable"); })
      .finally(() => !ctrl.signal.aborted && setLoading(false));
  }, [me, caller, mode, nonce]);

  const nextStep = useMemo(() => route?.steps.find((s, i) => i > 0) ?? route?.steps[0], [route]);
  const straight = me ? haversine(me, caller) : null;
  const gmaps = `https://www.google.com/maps/dir/?api=1${me ? `&origin=${me.lat},${me.lng}` : ""}&destination=${caller.lat},${caller.lng}&travelmode=${mode === "drive" ? "driving" : "walking"}&dir_action=navigate`;

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border/70 bg-card shadow-soft", full && "fixed inset-0 z-[90] flex flex-col rounded-none border-0")}>
      {/* Next-turn banner */}
      <div className="flex items-center gap-3 bg-success px-4 py-3 text-success-foreground">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-success-foreground/15"><StepIcon step={nextStep} className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          {nextStep ? <>
            <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">In {formatDistance(route?.steps[0]?.distance ?? nextStep.distance)}</p>
            <p className="truncate text-[15px] font-bold">{nextStep.instruction}</p>
          </> : <p className="text-[14px] font-bold">{gpsError ?? (me ? (routeError ? "Route unavailable — follow the line to the caller" : "Finding the fastest route…") : "Getting your location…")}</p>}
        </div>
        <button type="button" onClick={() => setFull((v) => !v)} aria-label={full ? "Exit full screen" : "Full screen navigation"} className="grid h-9 w-9 place-items-center rounded-lg bg-success-foreground/15">
          {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      <div className={cn("relative bg-muted", full ? "flex-1" : "h-64 sm:h-80")}>
        {useGoogle ? <GoogleRouteCanvas me={me} caller={caller} route={route} onFail={() => setGoogleFailed(true)} /> : <OsmRouteCanvas me={me} caller={caller} route={route} />}
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
            {route ? `${formatDistance(route.distance)} to ${callerName}` : straight !== null ? `${formatDistance(straight)} away in a straight line` : "Waiting for your GPS"}
          </p>
        </div>
        <button type="button" onClick={() => { anchor.current = null; setNonce((n) => n + 1); }} aria-label="Recalculate route" className="grid h-10 w-10 place-items-center rounded-xl border border-border/70"><LocateFixed className="h-4 w-4" /></button>
        <a href={gmaps} target="_blank" rel="noreferrer" className="flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-[12px] font-bold text-primary-foreground"><ExternalLink className="h-3.5 w-3.5" /> Voice navigation</a>
      </div>

      {route && route.steps.length > 1 && (
        <ol className={cn("divide-y divide-border/60 overflow-y-auto border-t border-border/60", full ? "max-h-[30vh]" : "max-h-44")}>
          {route.steps.slice(1).map((s, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-2.5">
              <StepIcon step={s} className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{s.instruction}</span>
              <span className="text-[11px] text-muted-foreground">{s.distance > 0 ? formatDistance(s.distance) : ""}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="border-t border-border/60 px-4 py-1.5 text-[9.5px] text-muted-foreground">Routes © OpenStreetMap contributors · Drive safely</p>
    </div>
  );
}
