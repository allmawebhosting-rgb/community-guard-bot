import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Crosshair,
  ExternalLink,
  LocateFixed,
  Minus,
  Navigation2,
  Phone,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HELP_KIND_COLOR, helpKind, type HelpPlace } from "@/components/allma/nearby-help-list";
import {
  getGoogleMapsBrowserKey,
  googleMapsAuthFailed,
  loadGoogleMaps,
  onGoogleMapsAuthFailure,
} from "@/lib/google-maps-loader";
import { nearbyMarkerDataUrl } from "@/lib/nearby-marker";

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
  { label: "Nearby", span: 1300 },
  { label: "Area", span: 2600 },
  { label: "City", span: 10_000 },
] as const;

const TILE_SIZE = 256;
const MAP_TILE_ZOOMS = [18, 16, 15, 14, 12] as const;

type GoogleInfoWindow = {
  close: () => void;
  setContent: (content: HTMLElement) => void;
  open: (options: { map: unknown; anchor: unknown }) => void;
};

function lngToTileX(lng: number, z: number) {
  return ((lng + 180) / 360) * 2 ** z;
}

function latToTileY(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

function getAutoFitZoomIndex(
  center: { lat: number; lng: number },
  places: HelpPlace[],
  width: number,
  height: number,
) {
  const points = [
    center,
    ...[...places]
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, 3)
      .map((place) => ({ lat: place.latitude, lng: place.longitude })),
  ];
  for (const index of [2, 3, 4]) {
    const zoom = MAP_TILE_ZOOMS[index];
    const centerX = lngToTileX(center.lng, zoom);
    const centerY = latToTileY(center.lat, zoom);
    const fits = points.every((point) => {
      const dx = Math.abs((lngToTileX(point.lng, zoom) - centerX) * TILE_SIZE);
      const dy = Math.abs((latToTileY(point.lat, zoom) - centerY) * TILE_SIZE);
      return dx <= width / 2 - 36 && dy <= height / 2 - 36;
    });
    if (fits) return index;
  }
  return 4;
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

  if (failed) {
    return (
      <div
        ref={wrapperRef}
        role="img"
        aria-label="Approximate map view. Street map tiles are unavailable."
        className="map-tint absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_25%_30%,hsl(var(--primary)/.12),transparent_42%),linear-gradient(135deg,hsl(var(--secondary)/.8),hsl(var(--background)))]"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <span className="absolute bottom-3 left-3 rounded-lg border border-border/60 bg-background/90 px-3 py-2 text-[10px] font-semibold text-muted-foreground shadow-sm backdrop-blur">
          Street map unavailable · showing approximate locations
        </span>
      </div>
    );
  }

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

export type LiveMapTypeId = "roadmap" | "hybrid" | "satellite";

/** Google Maps canvas centred on the given coordinates (non-interactive, own controls). */
export function GoogleLocationCanvas({
  lat,
  lng,
  zoom,
  places = [],
  selectedPlaceId = null,
  onSelectPlace,
  onFail,
  mapTypeId = "roadmap",
  compact = false,
  routeTo = null,
}: {
  lat: number;
  lng: number;
  zoom: number;
  routeTo?: { lat: number; lng: number } | null;
  places?: HelpPlace[];
  selectedPlaceId?: string | null;
  onSelectPlace?: (id: string) => void;
  onFail: () => void;
  mapTypeId?: LiveMapTypeId;
  compact?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapsRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<GoogleInfoWindow | null>(null);
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
          mapTypeId,
          disableDefaultUI: true,
          gestureHandling: "cooperative",
          keyboardShortcuts: false,
          clickableIcons: false,
          // Raster hybrid keeps the in-chat SOS card light and readable on mobile.
          renderingType: maps.RenderingType?.RASTER ?? "RASTER",
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

  useEffect(() => {
    if (!mapRef.current || !mapTypeId) return;
    mapRef.current.setMapTypeId(mapTypeId);
  }, [mapTypeId]);

  // Nearby help markers (police, clinics, hospitals) drawn on the same canvas.
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!mapReady || !maps || !map) return;
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = places.map((place) => {
      const kind = helpKind(place.type, place.name);
      const distanceLabel = Number.isFinite(place.distance_m)
        ? place.distance_m < 950
          ? `${Math.round(place.distance_m)} m`
          : `${(place.distance_m / 1000).toFixed(1)} km`
        : "";
      const infoContent = document.createElement("div");
      infoContent.style.cssText = "font: 13px system-ui,sans-serif;max-width:240px;padding:4px 2px";
      const name = document.createElement("strong");
      name.textContent = place.name;
      name.style.display = "block";
      const details = document.createElement("span");
      details.textContent = [distanceLabel, kind].filter(Boolean).join(" · ");
      details.style.cssText = "display:block;margin-top:4px;color:#52616b;text-transform:capitalize";
      infoContent.append(name, details);
      const markerSize = compact ? 34 : 48;
      const marker = new maps.Marker({
        map,
        position: { lat: place.latitude, lng: place.longitude },
        title: [place.name, distanceLabel, kind].filter(Boolean).join(" · "),
        icon: {
          url: nearbyMarkerDataUrl(kind, HELP_KIND_COLOR[kind]),
          scaledSize: new maps.Size(markerSize, markerSize),
          anchor: new maps.Point(markerSize / 2, markerSize / 2),
        },
        zIndex: 1,
      });
      marker.addListener("click", () => {
        selectRef.current?.(place.id);
      });
      (marker as { __placeId?: string; __infoContent?: HTMLElement }).__placeId = place.id;
      (marker as { __placeId?: string; __infoContent?: HTMLElement }).__infoContent = infoContent;
      return marker;
    });
    const nearest = [...places].sort((a, b) => a.distance_m - b.distance_m).slice(0, 3);
    const bounds = new maps.LatLngBounds();
    bounds.extend({ lat, lng });
    nearest.forEach((place) => bounds.extend({ lat: place.latitude, lng: place.longitude }));
    if (nearest.length > 0) map.fitBounds(bounds, 40);
    return () => {
      markersRef.current.forEach((marker) => {
        marker.setMap(null);
      });
      infoWindowRef.current?.close();
      markersRef.current = [];
    };
  }, [compact, lat, lng, mapReady, places]);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!mapReady || !maps || !map) return;
    markersRef.current.forEach((marker) => {
      const placeId = (marker as { __placeId?: string }).__placeId;
      const active = placeId === selectedPlaceId;
      marker.setZIndex(active ? 4 : 1);
      const base = compact ? 34 : 48;
      const size = active ? Math.round(base * 1.35) : base;
      const icon = marker.getIcon?.();
      if (icon && typeof icon === "object") {
        marker.setIcon({
          ...icon,
          scaledSize: new maps.Size(size, size),
          anchor: new maps.Point(size / 2, size / 2),
        });
      }
      marker.setAnimation?.(active ? maps.Animation?.BOUNCE ?? null : null);
      if (active) window.setTimeout(() => marker.setAnimation?.(null), 1400);
    });
  }, [compact, mapReady, places, selectedPlaceId]);

  // Straight guide line from YOU to the chosen place (stays inside the chat).
  const routeLineRef = useRef<any>(null);
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    routeLineRef.current?.setMap(null);
    routeLineRef.current = null;
    if (!mapReady || !maps || !map || !routeTo) return;
    routeLineRef.current = new maps.Polyline({
      map,
      path: [{ lat, lng }, routeTo],
      geodesic: true,
      strokeOpacity: 0,
      icons: [
        {
          icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#dc2626", strokeWeight: 4, scale: 3 },
          offset: "0",
          repeat: "14px",
        },
      ],
      zIndex: 3,
    });
    const bounds = new maps.LatLngBounds();
    bounds.extend({ lat, lng });
    bounds.extend(routeTo);
    map.fitBounds(bounds, 48);
    return () => {
      routeLineRef.current?.setMap(null);
      routeLineRef.current = null;
    };
  }, [lat, lng, mapReady, routeTo?.lat, routeTo?.lng]);

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
  mapTypeId = "roadmap",
  showMapTypeToggle = true,
  compact = false,
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
  /** Satellite hybrid is the default for SOS readability. */
  mapTypeId?: LiveMapTypeId;
  showMapTypeToggle?: boolean;
  /** Slimmer chrome for in-chat SOS cards. */
  compact?: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const [activeMapType, setActiveMapType] = useState<LiveMapTypeId>(mapTypeId);
  const [localSelectedPlaceId, setLocalSelectedPlaceId] = useState<string | null>(null);
  const [guiding, setGuiding] = useState(false);
  const activeId = selectedPlaceId ?? localSelectedPlaceId;
  const activePlace = places.find((p) => p.id === activeId) ?? null;
  const selectPlace = (id: string) => {
    setLocalSelectedPlaceId(id);
    onSelectPlace?.(id);
  };
  const clearPlace = () => {
    setLocalSelectedPlaceId(null);
    setGuiding(false);
    onSelectPlace?.("");
  };
  useEffect(() => {
    if (!activePlace) setGuiding(false);
  }, [activePlace]);
  const liveDistance = activePlace
    ? distanceMetres(location.lat, location.lng, activePlace.latitude, activePlace.longitude)
    : 0;
  const heading = activePlace
    ? compassLabel(bearingDegrees(location.lat, location.lng, activePlace.latitude, activePlace.longitude))
    : "";
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [canvasHeight, setCanvasHeight] = useState(208);
  const [canvasWidth, setCanvasWidth] = useState(640);
  const manualZoomRef = useRef(false);
  const autoFitKeyRef = useRef("");
  const level = MAP_ZOOM_LEVELS[zoom];
  const accuracy = typeof location.accuracy === "number" ? location.accuracy : null;

  const tileZoom = MAP_TILE_ZOOMS[zoom] ?? 16;
  const useGoogle =
    Boolean(getGoogleMapsBrowserKey()) && !googleFailed && !googleMapsAuthFailed();

  useEffect(() => {
    setActiveMapType(mapTypeId);
  }, [mapTypeId]);

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

  useEffect(() => {
    if (manualZoomRef.current) return;
    const closest = [...places]
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, 3)
      .map((place) => place.id)
      .join(",");
    const fitKey = `${location.lat.toFixed(3)},${location.lng.toFixed(3)}:${canvasWidth}x${canvasHeight}:${closest}`;
    if (autoFitKeyRef.current === fitKey) return;
    autoFitKeyRef.current = fitKey;
    setZoom(getAutoFitZoomIndex(location, places, canvasWidth, canvasHeight));
  }, [canvasHeight, canvasWidth, location.lat, location.lng, places]);

  const changeZoom = (update: (current: number) => number) => {
    manualZoomRef.current = true;
    setZoom(update);
  };
  const resetZoom = () => {
    manualZoomRef.current = false;
    setZoom(getAutoFitZoomIndex(location, places, canvasWidth, canvasHeight));
  };

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
    <div
      className={cn(
        "overflow-hidden transition-shadow duration-300",
        compact
          ? "border-0 bg-transparent shadow-none"
          : "premium-surface shadow-soft border border-border/70 hover:shadow-lift rounded-2xl",
      )}
    >
      <div ref={canvasRef} className={cn("relative bg-muted", heightClassName)}>
        {useGoogle ? (
          <GoogleLocationCanvas
            lat={location.lat}
            lng={location.lng}
            zoom={tileZoom}
            places={places}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={selectPlace}
            routeTo={guiding && activePlace ? { lat: activePlace.latitude, lng: activePlace.longitude } : null}
            mapTypeId={activeMapType}
            compact={compact}
            onFail={() => setGoogleFailed(true)}
          />
        ) : (
          <>
            <OsmTileMap lat={location.lat} lng={location.lng} zoom={tileZoom} />
            {fallbackPins.map(({ place, dx, dy }) => {
              const kind = helpKind(place.type, place.name);
              const distanceLabel = Number.isFinite(place.distance_m)
                ? place.distance_m < 950
                  ? `${Math.round(place.distance_m)} m`
                  : `${(place.distance_m / 1000).toFixed(1)} km`
                : "";
              const active =
                activeId === place.id;
              return (
                <button
                  key={place.id}
                  type="button"
                  title={[place.name, distanceLabel, kind].filter(Boolean).join(" · ")}
                  aria-label={`${place.name}${distanceLabel ? `, ${distanceLabel} away` : ""}, ${kind}`}
                  aria-pressed={active}
                  onClick={() => {
                    if (active) clearPlace();
                    else selectPlace(place.id);
                  }}
                  className={cn(
                    "absolute -translate-x-1/2 -translate-y-1/2 group focus:z-20",
                    active ? "z-10" : "z-0"
                  )}
                  style={{
                    left: `calc(50% + ${dx}px)`,
                    top: `calc(50% + ${dy}px)`
                  }}
                >
                  <img
                    src={nearbyMarkerDataUrl(kind, HELP_KIND_COLOR[kind])}
                    alt=""
                    aria-hidden="true"
                    className="relative z-10 h-12 w-12 drop-shadow-sm"
                  />
                  {/* Tooltip/label on hover/focus */}
                  <span className={cn("pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-max max-w-52 -translate-x-1/2 rounded bg-background/95 px-2 py-1 text-xs font-semibold text-foreground shadow transition", active ? "opacity-100" : "scale-95 opacity-0 group-hover:opacity-100 group-focus:opacity-100")}>
                    {place.name}
                    {distanceLabel ? (
                      <span className="ml-2 text-muted-foreground font-normal">{distanceLabel}</span>
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
              style={{
                height: compact ? Math.min(accuracyPx, canvasHeight * 0.45) : accuracyPx,
                width: compact ? Math.min(accuracyPx, canvasHeight * 0.45) : accuracyPx,
              }}
            />
          )}
          <span
            className={cn(
              "absolute animate-ping rounded-full bg-destructive/20 [animation-duration:1.6s]",
              compact ? "h-7 w-7" : "h-12 w-12",
            )}
          />
          <span className="sos-glow-sm h-3.5 w-3.5 rounded-full border-2 border-background bg-destructive" />
        </div>

        {/* Zoom + map-type controls */}
        <div
          className={cn(
            "absolute right-2 top-2 flex flex-col overflow-hidden border border-border/50 bg-background/85 shadow-sm backdrop-blur-md",
            compact ? "rounded-2xl" : "rounded-xl",
          )}
        >
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => changeZoom((z) => Math.max(0, z - 1))}
            disabled={zoom === 0}
            className={cn(
              "grid place-items-center bg-background/90 text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-55",
              compact ? "h-7 w-7" : "h-9 w-9",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <span className="h-px bg-border" />
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => changeZoom((z) => Math.min(MAP_ZOOM_LEVELS.length - 1, z + 1))}
            disabled={zoom === MAP_ZOOM_LEVELS.length - 1}
            className={cn(
              "grid place-items-center bg-background/90 text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-55",
              compact ? "h-7 w-7" : "h-9 w-9",
            )}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="h-px bg-border" />
          <button
            type="button"
            aria-label="Recenter"
            onClick={resetZoom}
            className={cn(
              "grid place-items-center bg-background/90 text-destructive transition hover:bg-accent",
              compact ? "h-7 w-7" : "h-9 w-9",
            )}
          >
            <Crosshair className="h-3.5 w-3.5" />
          </button>
        </div>

        {useGoogle && showMapTypeToggle ? (
          <div
            className={cn(
              "absolute bottom-2 right-2 z-10 flex overflow-hidden border border-border/60 bg-background/90 font-bold uppercase tracking-[0.08em] shadow-sm backdrop-blur-md",
              compact
                ? "rounded-full text-[9px]"
                : "rounded-full text-[10px]",
            )}
          >
            <button
              type="button"
              aria-pressed={activeMapType === "hybrid" || activeMapType === "satellite"}
              onClick={() => setActiveMapType("hybrid")}
              className={cn(
                "transition",
                compact ? "px-2.5 py-1" : "px-2.5 py-1.5",
                activeMapType === "hybrid" || activeMapType === "satellite"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Satellite
            </button>
            <button
              type="button"
              aria-pressed={activeMapType === "roadmap"}
              onClick={() => setActiveMapType("roadmap")}
              className={cn(
                "transition",
                compact ? "px-2.5 py-1" : "px-2.5 py-1.5",
                activeMapType === "roadmap"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Map
            </button>
          </div>
        ) : null}

        <div
          className={cn(
            "pointer-events-none absolute left-2 top-2 flex items-center gap-1 border border-border/50 bg-background/90 font-semibold uppercase tracking-[0.08em] text-muted-foreground shadow-sm backdrop-blur-md",
            compact
              ? "max-w-[9.5rem] rounded-full px-2 py-0.5 text-[9px]"
              : "max-w-[calc(100%-4.5rem)] rounded-full px-2.5 py-1 text-[10px]",
          )}
        >
          <LocateFixed className={cn(compact ? "h-2.5 w-2.5" : "h-3 w-3", "shrink-0 text-success")} />
          <span className="truncate">
            {compact
              ? `You${accuracy !== null ? ` · ±${Math.round(accuracy)}m` : ""}`
              : `${badge} · ${level.label}${accuracy !== null ? ` · ±${Math.round(accuracy)} m` : ""}${places.length > 0 ? ` · ${places.length} nearby` : ""}`}
          </span>
        </div>
      </div>

      {activePlace ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "mt-2 rounded-2xl border bg-card px-3 py-2.5 shadow-sm",
            guiding ? "border-destructive/40" : "border-border/60",
          )}
        >
          <div className="flex items-start gap-2.5">
            <img
              src={nearbyMarkerDataUrl(helpKind(activePlace.type, activePlace.name), HELP_KIND_COLOR[helpKind(activePlace.type, activePlace.name)])}
              alt=""
              aria-hidden="true"
              className="h-9 w-9 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-foreground">{activePlace.name}</p>
              <p className="text-[11.5px] font-semibold text-muted-foreground">
                <span className="capitalize">{helpKind(activePlace.type, activePlace.name)}</span>
                {" · "}
                {formatDistance(liveDistance)} {heading}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                About {formatMinutes(liveDistance, 4.5)} walk · {formatMinutes(liveDistance, 25)} by car
              </p>
            </div>
            <button
              type="button"
              aria-label="Close place details"
              onClick={clearPlace}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {guiding ? (
            <p className="mt-2 rounded-xl bg-destructive/10 px-2.5 py-1.5 text-[12px] font-bold text-destructive">
              Head {heading} · {formatDistance(liveDistance)} to go. The line updates as you move.
            </p>
          ) : null}
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              aria-pressed={guiding}
              onClick={() => setGuiding((g) => !g)}
              className={cn(
                "flex min-h-9 items-center justify-center gap-1.5 rounded-full text-[12px] font-bold transition",
                guiding
                  ? "border border-border/60 bg-background text-foreground hover:bg-accent"
                  : "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              )}
            >
              <Navigation2 className="h-3.5 w-3.5" />
              {guiding ? "Stop guiding" : "Guide me here"}
            </button>
            {activePlace.phone ? (
              <a
                href={`tel:${activePlace.phone.replace(/[^\d+]/g, "")}`}
                className="flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-border/60 bg-background text-[12px] font-bold text-foreground hover:bg-accent"
              >
                <Phone className="h-3.5 w-3.5" /> Call place
              </a>
            ) : (
              <span className="flex min-h-9 items-center justify-center rounded-full border border-dashed border-border/60 text-[11px] text-muted-foreground">
                No phone listed
              </span>
            )}
          </div>
        </div>
      ) : places.length > 0 ? (
        <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
          Tap a pin to see distance and get guided there.
        </p>
      ) : null}

      {!compact && (location.address || location.district) ? (
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
      ) : null}

      <div
        className={cn(
          "grid grid-cols-2 bg-card",
          compact ? "gap-1.5 border-0 px-0 pb-0 pt-2" : "gap-2 border-t border-border/60 p-2.5",
        )}
      >
        <a
          href={externalUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "flex items-center justify-center gap-1.5 border font-semibold text-foreground transition hover:bg-accent",
            compact
              ? "min-h-8 rounded-full border-border/50 bg-background/90 py-1.5 text-[11px]"
              : "min-h-10 rounded-xl border-border/70 bg-secondary px-3 py-2 text-[11.5px] font-bold hover:border-primary/40",
          )}
        >
          <ExternalLink className="h-3.5 w-3.5" /> {compact ? "Maps" : directionsLabel}
        </a>
        <button
          type="button"
          onClick={copyCoords}
          className={cn(
            "flex items-center justify-center gap-1.5 border font-semibold transition",
            compact ? "min-h-8 rounded-full py-1.5 text-[11px]" : "min-h-10 rounded-xl px-3 py-2 text-[11.5px]",
            copied
              ? "border-success/30 bg-success/15 text-success"
              : compact
                ? "border-border/50 bg-background/90 text-foreground hover:bg-accent"
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


function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearingDegrees(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function compassLabel(deg: number) {
  const names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return names[Math.round(deg / 45) % 8];
}

function formatDistance(m: number) {
  return m < 950 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Rough straight-line estimate; roads add distance, so we round up. */
function formatMinutes(m: number, kmh: number) {
  const mins = Math.max(1, Math.ceil(((m * 1.3) / 1000 / kmh) * 60));
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
}
