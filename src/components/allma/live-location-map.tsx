import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Crosshair,
  ExternalLink,
  LocateFixed,
  Minus,
  Navigation2,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HELP_KIND_COLOR, helpKind, type HelpPlace } from "@/components/allma/nearby-help-list";
import {
  getGoogleMapsBrowserKey,
  googleMapsAuthFailed,
  loadGoogleMaps,
  onGoogleMapsAuthFailure,
} from "@/lib/google-maps-loader";



// ─── Live location map (shared by the SOS screen and the emergency call screen) ──

export type LiveLocationPoint = {
  lat: number;
  lng: number;
  accuracy?: number | null;
  address?: string;
  district?: string;
};

export const MAP_ZOOM_LEVELS = [
  { label: "Street", span: 250 },
  { label: "Block", span: 700 },
  { label: "Area", span: 2000 },
  { label: "City", span: 6000 },
] as const;

const TILE_SIZE = 256;

function lngToTileX(lng: number, z: number) {
  return ((lng + 180) / 360) * 2 ** z;
}

function latToTileY(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

/** Keyless OpenStreetMap raster tile map centred on the given coordinates. */
export function OsmTileMap({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const [failed, setFailed] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 640, height: 208 });

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const xExact = lngToTileX(lng, zoom);
  const yExact = latToTileY(lat, zoom);
  const max = 2 ** zoom;
  const cx = Math.floor(xExact);
  const cy = Math.floor(yExact);

  // Cover the measured container exactly — no visible repeated or missing tiles.
  const colRadius = Math.ceil(size.width / 2 / TILE_SIZE) + 1;
  const rowRadius = Math.ceil(size.height / 2 / TILE_SIZE) + 1;

  const tiles: { key: string; url: string; left: number; top: number }[] = [];
  for (let dx = -colRadius; dx <= colRadius; dx += 1) {
    for (let dy = -rowRadius; dy <= rowRadius; dy += 1) {
      const tx = cx + dx;
      const ty = cy + dy;
      if (ty < 0 || ty >= max) continue;
      const wrappedX = ((tx % max) + max) % max;
      tiles.push({
        key: `${zoom}-${tx}-${ty}`,
        url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${ty}.png`,
        left: (tx - xExact) * TILE_SIZE,
        top: (ty - yExact) * TILE_SIZE,
      });
    }
  }

  if (failed) return <div ref={wrapperRef} className="absolute inset-0" aria-hidden />;

  return (
    <div ref={wrapperRef} className="map-tint absolute inset-0 overflow-hidden" aria-hidden>
      {tiles.map((tile) => (
        <img
          key={tile.key}
          src={tile.url}
          alt=""
          width={TILE_SIZE}
          height={TILE_SIZE}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="pointer-events-none absolute select-none"
          style={{
            width: TILE_SIZE,
            height: TILE_SIZE,
            left: `calc(50% + ${tile.left}px)`,
            top: `calc(50% + ${tile.top}px)`,
          }}
        />
      ))}
      <span className="absolute bottom-1 right-1.5 rounded bg-background/70 px-1 text-[8.5px] font-medium text-muted-foreground">
        © OpenStreetMap contributors
      </span>
    </div>
  );
}

/** Google Maps canvas centred on the given coordinates (non-interactive, own controls). */
export function GoogleLocationCanvas({
  lat,
  lng,
  zoom,
  places = [],
  selectedPlaceId = null,
  onSelectPlace,
  onFail,
}: {
  lat: number;
  lng: number;
  zoom: number;
  places?: HelpPlace[];
  selectedPlaceId?: string | null;
  onSelectPlace?: (id: string) => void;
  onFail: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapsRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const selectRef = useRef(onSelectPlace);
  selectRef.current = onSelectPlace;

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onGoogleMapsAuthFailure(() => {
      if (!cancelled) onFail();
    });
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        const map = new maps.Map(containerRef.current, {
          center: { lat, lng },
          zoom,
          disableDefaultUI: true,
          gestureHandling: "none",
          keyboardShortcuts: false,
          clickableIcons: false,
        });
        mapRef.current = map;
        mapsRef.current = maps;
        setMapReady(true);
        // If the key is rejected for this domain Google swaps the canvas for its own
        // error panel — poll for it and fall back to open tiles when it appears.
        let checks = 0;
        const timer = window.setInterval(() => {
          checks += 1;
          const node = containerRef.current;
          if (cancelled || checks > 12 || !node) {
            window.clearInterval(timer);
            return;
          }
          const errored =
            node.querySelector(".gm-err-container") !== null ||
            /load Google Maps correctly/i.test(node.textContent ?? "");
          if (errored) {
            window.clearInterval(timer);
            onFail();
          }
        }, 1000);


      })
      .catch(() => {
        if (!cancelled) onFail();
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setCenter({ lat, lng });
    mapRef.current.setZoom(zoom);
  }, [lat, lng, zoom]);

  // Nearby help markers (police, clinics, hospitals) drawn on the same canvas.
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!mapReady || !maps || !map) return;
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = places.map((place) => {
      const kind = helpKind(place.type);
      const color = HELP_KIND_COLOR[kind];
      const isHospital = kind === "hospital" || kind === "clinic";
      let marker;
      if (isHospital) {
        // Animated SVG marker for hospital/clinic
        let pulse = 0;
        const getIcon = () => {
          // Pulse between 0.7 and 1.15 scale
          const scale = 1 + 0.15 * Math.sin(pulse);
          pulse += 0.18;
          return {
            url:
              `data:image/svg+xml;utf8,` +
              encodeURIComponent(`
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="16" cy="16" r="12" fill="#34d399" fill-opacity="0.32"/>
                  <circle cx="16" cy="16" r="7" fill="#34d399" filter="url(#glow)"/>
                  <g>
                    <rect x="14.2" y="8.5" width="3.6" height="15" rx="1.2" fill="#fff"/>
                    <rect x="8.5" y="14.2" width="15" height="3.6" rx="1.2" fill="#fff"/>
                  </g>
                  <defs>
                    <filter id="glow" x="0" y="0" width="32" height="32" filterUnits="userSpaceOnUse">
                      <feGaussianBlur stdDeviation="2.5" result="blur"/>
                      <feMerge>
                        <feMergeNode in="blur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                </svg>
              `),
            scaledSize: new maps.Size(32 * scale, 32 * scale),
            anchor: new maps.Point(16 * scale, 16 * scale),
          };
        };
        marker = new maps.Marker({
          map,
          position: { lat: place.latitude, lng: place.longitude },
          title: place.name,
          icon: getIcon(),
        });
        marker.addListener("click", () => selectRef.current?.(place.id));
        // Animate the marker icon
        const interval = setInterval(() => {
          marker.setIcon(getIcon());
        }, 320);
        marker._allmaPulseInterval = interval;
      } else {
        marker = new maps.Marker({
          map,
          position: { lat: place.latitude, lng: place.longitude },
          title: place.name,
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: selectedPlaceId === place.id ? 9 : 6.5,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: "#0d0f10",
            strokeWeight: selectedPlaceId === place.id ? 3 : 1.5,
          },
        });
        marker.addListener("click", () => selectRef.current?.(place.id));
      }
      return marker;
    });
    // Clean up animated intervals
    return () => {
      markersRef.current.forEach((marker) => {
        if (marker._allmaPulseInterval) clearInterval(marker._allmaPulseInterval);
        marker.setMap(null);
      });
      markersRef.current = [];
    };
  }, [mapReady, places, selectedPlaceId]);

  return <div ref={containerRef} className="absolute inset-0" />;
}


export function LiveLocationMap({
  location,
  badge = "Live",
  directionsLabel = "Open in Google Maps",
  directions = false,
  heightClassName = "h-52 lg:h-[19rem]",
  places = [],
  selectedPlaceId = null,
  onSelectPlace,
}: {
  location: LiveLocationPoint;
  /** Small label shown in the map corner. */
  badge?: string;
  directionsLabel?: string;
  /** Use a navigation (directions) link instead of a plain map pin link. */
  directions?: boolean;
  /** Height utilities for the map canvas (responsive by default). */
  heightClassName?: string;
  /** Nearby help places (police, clinics, hospitals) shown as coloured pins. */
  places?: HelpPlace[];
  selectedPlaceId?: string | null;
  onSelectPlace?: (id: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [canvasHeight, setCanvasHeight] = useState(208);
  const [canvasWidth, setCanvasWidth] = useState(640);
  const level = MAP_ZOOM_LEVELS[zoom];
  const accuracy = typeof location.accuracy === "number" ? location.accuracy : null;

  const tileZoom = [18, 16, 14, 12][zoom] ?? 16;
  const useGoogle =
    Boolean(getGoogleMapsBrowserKey()) && !googleFailed && !googleMapsAuthFailed();

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      if (rect.height > 0) setCanvasHeight(rect.height);
      if (rect.width > 0) setCanvasWidth(rect.width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Accuracy circle drawn to the same scale as the tiles.
  const metresPerPixel = level.span / canvasHeight;
  const accuracyPx =
    accuracy === null
      ? 0
      : Math.max(18, Math.min(canvasHeight * 0.9, (accuracy / metresPerPixel) * 2));

  const coords = `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;

  const copyCoords = async () => {
    try {
      await navigator.clipboard.writeText(coords);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const externalUrl = directions
    ? `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`
    : `https://www.google.com/maps?q=${location.lat},${location.lng}&z=${tileZoom}`;

  // Open-tile fallback pins, projected to the same scale as the tiles.
  const fallbackPins = useGoogle
    ? []
    : places
        .map((place) => {
          const dx =
            (lngToTileX(place.longitude, tileZoom) - lngToTileX(location.lng, tileZoom)) * TILE_SIZE;
          const dy =
            (latToTileY(place.latitude, tileZoom) - latToTileY(location.lat, tileZoom)) * TILE_SIZE;
          return { place, dx, dy };
        })
        .filter(
          ({ dx, dy }) =>
            Math.abs(dx) < canvasWidth / 2 - 8 && Math.abs(dy) < canvasHeight / 2 - 8,
        );

  return (
    <div className="premium-surface shadow-soft overflow-hidden rounded-2xl border border-border/70 transition-shadow duration-300 hover:shadow-lift">
      <div ref={canvasRef} className={cn("relative bg-muted", heightClassName)}>
        {useGoogle ? (
          <GoogleLocationCanvas
            lat={location.lat}
            lng={location.lng}
            zoom={tileZoom}
            places={places}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={onSelectPlace}
            onFail={() => setGoogleFailed(true)}
          />
        ) : (
          <>
            <OsmTileMap lat={location.lat} lng={location.lng} zoom={tileZoom} />
            {fallbackPins.map(({ place, dx, dy }) => {
              const kind = helpKind(place.type);
              const color = HELP_KIND_COLOR[kind];
              const active = selectedPlaceId === place.id;
              const isHospital = kind === "hospital" || kind === "clinic";
              return (
                <button
                  key={place.id}
                  type="button"
                  title={place.name}
                  aria-label={place.name}
                  onClick={() => onSelectPlace?.(place.id)}
                  className={cn(
                    "absolute -translate-x-1/2 -translate-y-1/2 group focus:z-20",
                    active ? "z-10" : "z-0"
                  )}
                  style={{
                    left: `calc(50% + ${dx}px)`,
                    top: `calc(50% + ${dy}px)`
                  }}
                >
                  {isHospital ? (
                    <>
                      {/* Animated ping ring */}
                      <span className="absolute left-1/2 top-1/2 -z-10 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/30 animate-ping" style={{animationDuration:'1.5s'}} />
                      {/* Glowing emerald core */}
                      <span className="block h-4 w-4 rounded-full bg-emerald-400 shadow-[0_0_0_2px_white,0_0_8px_2px_#34d399] flex items-center justify-center">
                        {/* White cross icon */}
                        <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3" aria-hidden="true">
                          <rect x="8.25" y="3.5" width="3.5" height="13" rx="1.2" fill="#fff" />
                          <rect x="3.5" y="8.25" width="13" height="3.5" rx="1.2" fill="#fff" />
                        </svg>
                      </span>
                    </>
                  ) : (
                    <span
                      className="block h-3 w-3 rounded-full border-2 border-background"
                      style={{ backgroundColor: color }}
                    />
                  )}
                  {/* Tooltip/label on hover/focus */}
                  <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-max -translate-x-1/2 scale-95 rounded bg-background/95 px-2 py-1 text-xs font-semibold text-foreground opacity-0 shadow transition group-hover:opacity-100 group-focus:opacity-100">
                    {place.name}
                    {place.distance_m ? (
                      <span className="ml-2 text-muted-foreground font-normal">{Math.round(place.distance_m) < 1000 ? `${Math.round(place.distance_m)}m` : `${(place.distance_m/1000).toFixed(1)}km`}</span>
                    ) : null}
                    <span className="ml-2 text-muted-foreground font-normal capitalize">{kind}</span>
                  </span>
                </button>
              );
            })}
          </>
        )}



        {/* Accuracy radius + pulsing position marker */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          {accuracyPx > 0 && (
            <span
              className="absolute rounded-full border border-destructive/40 bg-destructive/10"
              style={{ height: accuracyPx, width: accuracyPx }}
            />
          )}
          <span className="absolute h-12 w-12 animate-ping rounded-full bg-destructive/20 [animation-duration:1.6s]" />
          <span className="sos-glow-sm h-3.5 w-3.5 rounded-full border-2 border-background bg-destructive" />
        </div>

        {/* Zoom controls */}
        <div className="absolute right-2.5 top-2.5 flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background/80 backdrop-blur-md">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.max(0, z - 1))}
            disabled={zoom === 0}
            className="grid h-9 w-9 place-items-center bg-background/90 text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <span className="h-px bg-border" />
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.min(MAP_ZOOM_LEVELS.length - 1, z + 1))}
            disabled={zoom === MAP_ZOOM_LEVELS.length - 1}
            className="grid h-9 w-9 place-items-center bg-background/90 text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="h-px bg-border" />
          <button
            type="button"
            aria-label="Recenter"
            onClick={() => setZoom(1)}
            className="grid h-9 w-9 place-items-center bg-background/90 text-destructive transition hover:bg-accent"
          >
            <Crosshair className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="pointer-events-none absolute left-2.5 top-2.5 flex max-w-[calc(100%-4.5rem)] items-center gap-1.5 rounded-full border border-border/60 bg-background/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground shadow-sm backdrop-blur-md">
          <LocateFixed className="h-3 w-3 text-success" />
          {badge} · {level.label}
          {accuracy !== null ? ` · ±${Math.round(accuracy)} m` : ""}
        </div>
      </div>

      {(location.address || location.district) && (
        <div className="flex items-start gap-2 border-t border-border/60 bg-card px-4 py-3">
          <Navigation2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[12.5px] font-semibold leading-relaxed text-foreground">
              {location.address}
              {location.address && location.district ? ", " : ""}
              {location.district}
            </p>
            <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{coords}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 border-t border-border/60 bg-card p-2.5">
        <a
          href={externalUrl}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border/70 bg-secondary px-3 py-2 text-[11.5px] font-bold text-foreground transition hover:border-primary/40 hover:bg-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" /> {directionsLabel}
        </a>
        <button
          type="button"
          onClick={copyCoords}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[11.5px] font-semibold transition",
            copied
              ? "border-success/30 bg-success/15 text-success"
              : "border-border/60 bg-secondary/40 text-foreground hover:bg-accent",
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy GPS"}
        </button>
      </div>
    </div>
  );
}
