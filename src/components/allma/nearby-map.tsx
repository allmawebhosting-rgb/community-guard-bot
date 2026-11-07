import { useEffect, useRef, useState } from "react";
import type { NearbyPlace } from "@/lib/places.types";
import {
  getGoogleMapsBrowserKey,
  googleMapsAuthFailed,
  loadGoogleMaps,
  onGoogleMapsAuthFailure,
} from "@/lib/google-maps-loader";
import { HELP_KIND_COLOR, helpKind } from "@/components/allma/nearby-help-list";
import { OsmTileMap } from "@/components/allma/live-location-map";
import { nearbyMarkerDataUrl } from "@/lib/nearby-marker";
import { cn } from "@/lib/utils";

export type NearbyRoute = {
  coordinates: Array<{ lat: number; lng: number }>;
  distance_m: number;
  duration_s: number;
  nextManeuver: string | null;
};

type NearbyMapProps = {
  center: { lat: number; lng: number };
  userLocation: { lat: number; lng: number; accuracy?: number } | null;
  places: NearbyPlace[];
  selectedPlaceId?: string | null;
  onSelectPlace?: (id: string) => void;
  route?: NearbyRoute | null;
};

type LatLng = { lat: number; lng: number };
type GoogleBounds = { extend: (position: LatLng) => void };
type GoogleMapOverlay = { setMap: (map: unknown) => void };
type GoogleMap = {
  setCenter: (center: LatLng) => void;
  panTo: (center: LatLng) => void;
  fitBounds: (bounds: GoogleBounds, padding?: number) => void;
};
type GoogleMarker = GoogleMapOverlay & {
  addListener: (event: string, listener: () => void) => void;
};
type GoogleInfoWindow = {
  close: () => void;
  setContent: (content: HTMLElement) => void;
  open: (options: { map: unknown; anchor: unknown }) => void;
};
type GoogleMapsNamespace = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  Marker: new (options: Record<string, unknown>) => GoogleMarker;
  Circle: new (options: Record<string, unknown>) => GoogleMapOverlay;
  Polyline: new (options: Record<string, unknown>) => GoogleMapOverlay;
  InfoWindow: new () => GoogleInfoWindow;
  LatLngBounds: new () => GoogleBounds;
  Size: new (width: number, height: number) => unknown;
  Point: new (x: number, y: number) => unknown;
  MapTypeControlStyle: { HORIZONTAL_BAR: string };
};
type GoogleMapsGlobal = { google?: { maps?: GoogleMapsNamespace } };

function getGoogleMaps() {
  return (globalThis as typeof globalThis & GoogleMapsGlobal).google?.maps;
}

function projectToWorld(point: LatLng, zoom: number) {
  const scale = 2 ** zoom;
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, point.lat));
  const radians = (latitude * Math.PI) / 180;
  return {
    x: ((point.lng + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * scale,
  };
}

function getFallbackCamera(points: LatLng[], width: number, height: number) {
  const usable = points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (usable.length === 0) return { center: { lat: 0.3152, lng: 32.5816 }, zoom: 14 };

  const baseZoom = 14;
  const projected = usable.map((point) => projectToWorld(point, baseZoom));
  const xs = projected.map((point) => point.x);
  const ys = projected.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  let zoom = baseZoom;

  if (usable.length > 1 && Math.max(spanX, spanY) > 0.00001) {
    const scaleToFit = Math.min(
      Math.max(140, width - 96) / (Math.max(spanX, 0.00001) * 256),
      Math.max(140, height - 96) / (Math.max(spanY, 0.00001) * 256),
    );
    zoom = Math.floor(Math.max(12, Math.min(15, baseZoom + Math.log2(Math.max(scaleToFit, 0.01)))));
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const worldScale = 2 ** baseZoom;
  const n = Math.PI - (2 * Math.PI * centerY) / worldScale;
  return {
    center: {
      lng: (centerX / worldScale) * 360 - 180,
      lat: (180 / Math.PI) * Math.atan(Math.sinh(n)),
    },
    zoom,
  };
}

const USER_BEACON_ICON = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="22" cy="22" r="9" fill="#2563eb" fill-opacity=".28">
      <animate attributeName="r" values="8;20" dur="1.8s" repeatCount="indefinite"/>
      <animate attributeName="fill-opacity" values=".32;0" dur="1.8s" repeatCount="indefinite"/>
    </circle>
    <circle cx="22" cy="22" r="8" fill="#2563eb" stroke="white" stroke-width="3"/>
  </svg>`,
)}`;

function FallbackMarker({ kind }: { kind: ReturnType<typeof helpKind> }) {
  return (
    <img
      src={nearbyMarkerDataUrl(kind, HELP_KIND_COLOR[kind])}
      alt=""
      aria-hidden="true"
      className="relative z-10 h-12 w-12 drop-shadow-sm"
    />
  );
}

export function NearbyMap({
  center,
  userLocation,
  places,
  selectedPlaceId: selectedId,
  onSelectPlace,
  route,
}: NearbyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fallbackRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const mapsRef = useRef<GoogleMapsNamespace | null>(null);
  const overlaysRef = useRef<GoogleMapOverlay[]>([]);
  const userOverlaysRef = useRef<GoogleMapOverlay[]>([]);
  const infoWindowRef = useRef<GoogleInfoWindow | null>(null);
  const centerRef = useRef(center);
  centerRef.current = center;
  const selectPlaceRef = useRef<(id: string) => void>(() => {});
  selectPlaceRef.current = (id: string) => {
    setLocalSelectedId(id);
    onSelectPlace?.(id);
  };
  const [ready, setReady] = useState<boolean>(() => Boolean(getGoogleMaps()));
  const [mapFailed, setMapFailed] = useState(googleMapsAuthFailed());
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const [fallbackSize, setFallbackSize] = useState({ width: 640, height: 320 });
  const selectedPlaceId = selectedId === undefined ? localSelectedId : selectedId;
  const browserKey = getGoogleMapsBrowserKey();
  const useGoogle = Boolean(browserKey) && ready && !mapFailed;
  useEffect(() => {
    const unsubscribe = onGoogleMapsAuthFailure(() => {
      setMapFailed(true);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!browserKey) {
      setMapFailed(true);
      return;
    }
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setReady(false);
          setMapFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [browserKey]);

  useEffect(() => {
    const maps = getGoogleMaps();
    if (!useGoogle || !containerRef.current || !maps) return;
    const map = new maps.Map(containerRef.current, {
      center: centerRef.current,
      zoom: 14,
      maxZoom: 15,
      mapTypeId: "roadmap",
      mapTypeControl: true,
      mapTypeControlOptions: { style: maps.MapTypeControlStyle.HORIZONTAL_BAR },
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
      gestureHandling: "greedy",
    });
    mapRef.current = map;
    mapsRef.current = maps;
    infoWindowRef.current = new maps.InfoWindow();
    return () => {
      infoWindowRef.current?.close();
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      userOverlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
      userOverlaysRef.current = [];
      mapRef.current = null;
      mapsRef.current = null;
    };
  }, [useGoogle]);

  useEffect(() => {
    if (!useGoogle || !mapRef.current) return;
    mapRef.current.setCenter({ lat: center.lat, lng: center.lng });
  }, [center.lat, center.lng, useGoogle]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (!useGoogle || !map || !maps) return;
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];

    places.slice(0, 30).forEach((place) => {
      const kind = helpKind(place.type, place.name);
      const distanceLabel = Number.isFinite(place.distance_m)
        ? place.distance_m < 950
          ? `${Math.round(place.distance_m)} m`
          : `${(place.distance_m / 1000).toFixed(1)} km`
        : "";
      const content = document.createElement("div");
      content.style.cssText = "font:13px system-ui,sans-serif;max-width:240px;padding:4px 2px";
      const name = document.createElement("strong");
      name.textContent = place.name;
      name.style.display = "block";
      const details = document.createElement("span");
      details.textContent = [distanceLabel, kind].filter(Boolean).join(" · ");
      details.style.cssText =
        "display:block;margin-top:4px;color:#52616b;text-transform:capitalize";
      content.append(name, details);
      const marker = new maps.Marker({
        map,
        position: { lat: place.latitude, lng: place.longitude },
        title: [place.name, distanceLabel, kind].filter(Boolean).join(" · "),
        icon: {
          url: nearbyMarkerDataUrl(kind, HELP_KIND_COLOR[kind]),
          scaledSize: new maps.Size(48, 48),
          anchor: new maps.Point(24, 24),
        },
        zIndex: selectedPlaceId === place.id ? 2 : 1,
      });
      marker.addListener("click", () => {
        selectPlaceRef.current(place.id);
        map.panTo({ lat: place.latitude, lng: place.longitude });
        infoWindowRef.current?.setContent(content);
        infoWindowRef.current?.open({ map, anchor: marker });
      });
      overlaysRef.current.push(marker);
    });

    if (route?.coordinates.length) {
      overlaysRef.current.push(
        new maps.Polyline({
          map,
          path: route.coordinates.map(({ lat, lng }) => ({ lat, lng })),
          geodesic: true,
          strokeColor: "#059669",
          strokeOpacity: 0.95,
          strokeWeight: 6,
        }),
      );
    } else if (selectedPlaceId) {
      const selected = places.find((place) => place.id === selectedPlaceId);
      if (selected) map.panTo({ lat: selected.latitude, lng: selected.longitude });
    }

    return () => {
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
    };
  }, [places, route, selectedPlaceId, useGoogle]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (!useGoogle || !map || !maps || !userLocation) {
      userOverlaysRef.current.forEach((overlay) => overlay.setMap(null));
      userOverlaysRef.current = [];
      return;
    }
    userOverlaysRef.current.forEach((overlay) => overlay.setMap(null));
    const overlays: GoogleMapOverlay[] = [
      new maps.Marker({
        map,
        position: { lat: userLocation.lat, lng: userLocation.lng },
        title: `Your location${userLocation.accuracy ? ` · accurate to ±${Math.round(userLocation.accuracy)} m` : ""}`,
        icon: {
          url: USER_BEACON_ICON,
          scaledSize: new maps.Size(44, 44),
          anchor: new maps.Point(22, 22),
        },
      }),
    ];
    if (userLocation.accuracy && Number.isFinite(userLocation.accuracy)) {
      overlays.push(
        new maps.Circle({
          map,
          center: { lat: userLocation.lat, lng: userLocation.lng },
          radius: Math.max(5, userLocation.accuracy),
          fillColor: "#2563eb",
          fillOpacity: 0.1,
          strokeColor: "#2563eb",
          strokeOpacity: 0.45,
          strokeWeight: 1,
        }),
      );
    }
    userOverlaysRef.current = overlays;
    return () => {
      overlays.forEach((overlay) => overlay.setMap(null));
    };
  }, [useGoogle, userLocation]);

  const userFitKey = userLocation
    ? `${userLocation.lat.toFixed(3)},${userLocation.lng.toFixed(3)}`
    : "";
  const centerFitKey = `${center.lat.toFixed(3)},${center.lng.toFixed(3)}`;
  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (!useGoogle || !map || !maps) return;
    const fitPoints: LatLng[] = [
      center,
      ...(userLocation ? [{ lat: userLocation.lat, lng: userLocation.lng }] : []),
      ...places.slice(0, 30).map((place) => ({ lat: place.latitude, lng: place.longitude })),
      ...(route?.coordinates ?? []),
    ];
    if (fitPoints.length > 1) {
      const bounds = new maps.LatLngBounds();
      fitPoints.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, 48);
    } else {
      map.setCenter(center);
    }
  }, [centerFitKey, places, route, useGoogle, userFitKey]);

  useEffect(() => {
    if (useGoogle || !fallbackRef.current) return;
    const node = fallbackRef.current;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setFallbackSize({ width: rect.width, height: rect.height });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [useGoogle]);

  const selectedPlace = places.find((place) => place.id === selectedPlaceId);
  const closestPlaces = [...places]
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, 3)
    .map((place) => ({ lat: place.latitude, lng: place.longitude }));
  const cameraPoints = [
    center,
    ...(userLocation ? [{ lat: userLocation.lat, lng: userLocation.lng }] : []),
    ...closestPlaces,
    ...(selectedPlace ? [{ lat: selectedPlace.latitude, lng: selectedPlace.longitude }] : []),
    ...(route?.coordinates ?? []),
  ];
  const fallbackCamera = getFallbackCamera(cameraPoints, fallbackSize.width, fallbackSize.height);
  const fallbackZoom = fallbackCamera.zoom;
  const fallbackCenter = fallbackCamera.center;
  const tileX = (lng: number) => ((lng + 180) / 360) * 2 ** fallbackZoom;
  const tileY = (lat: number) => {
    const radians = (lat * Math.PI) / 180;
    return (
      ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * 2 ** fallbackZoom
    );
  };
  const userOffset = {
    dx: userLocation ? (tileX(userLocation.lng) - tileX(fallbackCenter.lng)) * 256 : 0,
    dy: userLocation ? (tileY(userLocation.lat) - tileY(fallbackCenter.lat)) * 256 : 0,
  };
  const metersPerPixel =
    (156543.03392 * Math.cos((center.lat * Math.PI) / 180)) / 2 ** fallbackZoom;
  const accuracyDiameter = userLocation?.accuracy
    ? Math.max(18, (userLocation.accuracy / metersPerPixel) * 2)
    : 0;
  const placeOffsets = places.slice(0, 30).map((place) => ({
    place,
    dx: (tileX(place.longitude) - tileX(fallbackCenter.lng)) * 256,
    dy: (tileY(place.latitude) - tileY(fallbackCenter.lat)) * 256,
  }));

  return (
    <div className="relative overflow-hidden rounded-[1.5rem] border border-border/60 bg-card/80 shadow-soft">
      {browserKey && !ready && !mapFailed && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-background/60 text-sm font-medium text-muted-foreground">
          Loading map…
        </div>
      )}
      {useGoogle ? (
        <div ref={containerRef} className="h-[390px] w-full lg:h-[560px]" />
      ) : (
        <div ref={fallbackRef} className="relative h-[390px] w-full overflow-hidden lg:h-[560px]">
          <OsmTileMap lat={fallbackCenter.lat} lng={fallbackCenter.lng} zoom={fallbackZoom} />
          {route?.coordinates.length ? (
            <svg
              className="pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-visible"
              viewBox={`0 0 ${fallbackSize.width} ${fallbackSize.height}`}
              aria-hidden="true"
            >
              <polyline
                points={route.coordinates
                  .map(
                    (point) =>
                      `${fallbackSize.width / 2 + (tileX(point.lng) - tileX(fallbackCenter.lng)) * 256},${fallbackSize.height / 2 + (tileY(point.lat) - tileY(fallbackCenter.lat)) * 256}`,
                  )
                  .join(" ")}
                fill="none"
                stroke="#047857"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity=".22"
              />
              <polyline
                points={route.coordinates
                  .map(
                    (point) =>
                      `${fallbackSize.width / 2 + (tileX(point.lng) - tileX(fallbackCenter.lng)) * 256},${fallbackSize.height / 2 + (tileY(point.lat) - tileY(fallbackCenter.lat)) * 256}`,
                  )
                  .join(" ")}
                fill="none"
                stroke="#10b981"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
          {userLocation ? (
            <>
              {accuracyDiameter > 0 && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute z-[6] -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-500/40 bg-blue-500/10"
                  style={{
                    width: accuracyDiameter,
                    height: accuracyDiameter,
                    left: `calc(50% + ${userOffset.dx}px)`,
                    top: `calc(50% + ${userOffset.dy}px)`,
                  }}
                />
              )}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute z-[6] h-9 w-9 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-blue-500/35 [animation-duration:1.8s]"
                style={{
                  left: `calc(50% + ${userOffset.dx}px)`,
                  top: `calc(50% + ${userOffset.dy}px)`,
                }}
              />
              <span
                aria-label="Your live location"
                className="pointer-events-none absolute z-[7] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-blue-600 shadow-[0_0_0_5px_rgba(37,99,235,0.23)]"
                style={{
                  left: `calc(50% + ${userOffset.dx}px)`,
                  top: `calc(50% + ${userOffset.dy}px)`,
                }}
              />
            </>
          ) : null}
          {placeOffsets
            .filter(
              ({ dx, dy }) =>
                Math.abs(dx) < fallbackSize.width / 2 && Math.abs(dy) < fallbackSize.height / 2,
            )
            .map(({ place, dx, dy }) => {
              const kind = helpKind(place.type, place.name);
              const active = selectedPlaceId === place.id;
              const distance = Number.isFinite(place.distance_m)
                ? place.distance_m < 950
                  ? `${Math.round(place.distance_m)} m`
                  : `${(place.distance_m / 1000).toFixed(1)} km`
                : "";
              return (
                <button
                  key={place.id}
                  type="button"
                  aria-label={`${place.name}${distance ? `, ${distance} away` : ""}, ${kind}`}
                  aria-pressed={active}
                  title={`${place.name}${distance ? ` · ${distance}` : ""} · ${kind}`}
                  onClick={() => {
                    selectPlaceRef.current(active ? "" : place.id);
                  }}
                  className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-500 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  style={{ left: `calc(50% + ${dx}px)`, top: `calc(50% + ${dy}px)` }}
                >
                  <FallbackMarker kind={kind} />
                  <span
                    className={cn(
                      "pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-max max-w-56 -translate-x-1/2 rounded-lg bg-background/95 px-2.5 py-1.5 text-left text-[11px] font-semibold text-foreground shadow-lg",
                      active
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
                    )}
                  >
                    <span className="block">{place.name}</span>
                    <span className="mt-0.5 block font-normal capitalize text-muted-foreground">
                      {[distance, kind].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              );
            })}
          <span className="absolute bottom-2 right-2 rounded bg-background/85 px-2 py-1 text-[9px] font-medium text-muted-foreground">
            © OpenStreetMap contributors
          </span>
        </div>
      )}
    </div>
  );
}
