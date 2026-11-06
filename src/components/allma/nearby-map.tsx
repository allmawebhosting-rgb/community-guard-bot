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
import { cn } from "@/lib/utils";

type NearbyMapProps = {
  center: { lat: number; lng: number };
  userLocation: { lat: number; lng: number };
  places: NearbyPlace[];
};

type GoogleMapOverlay = { setMap: (map: unknown) => void };
type GoogleInfoWindow = {
  close: () => void;
  setContent: (content: HTMLElement) => void;
  open: (options: { map: unknown; anchor: unknown }) => void;
};

export function NearbyMap({ center, userLocation, places }: NearbyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fallbackRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<GoogleMapOverlay[]>([]);
  const infoWindowRef = useRef<GoogleInfoWindow | null>(null);
  const [ready, setReady] = useState<boolean>(Boolean((globalThis as any)?.google?.maps));
  const [mapFailed, setMapFailed] = useState(googleMapsAuthFailed());
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [fallbackSize, setFallbackSize] = useState({ width: 640, height: 320 });
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
    if (!useGoogle || !containerRef.current || !(window as any)?.google?.maps) return;
    const maps = (window as any).google.maps;
    const map = new maps.Map(containerRef.current, {
      center: { lat: center.lat, lng: center.lng },
      zoom: 12,
      mapTypeId: "satellite",
      mapTypeControl: true,
      mapTypeControlOptions: { style: maps.MapTypeControlStyle.HORIZONTAL_BAR },
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
      gestureHandling: "greedy",
    });
    infoWindowRef.current = new maps.InfoWindow();
    markersRef.current.push(
      new maps.Marker({
        map,
        position: { lat: userLocation.lat, lng: userLocation.lng },
        title: "Your location",
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#2563eb",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      }),
    );
    markersRef.current.push(
      new maps.Circle({
        map,
        center: { lat: userLocation.lat, lng: userLocation.lng },
        radius: 2000,
        fillColor: "#22c55e",
        fillOpacity: 0.08,
        strokeColor: "#22c55e",
        strokeOpacity: 0.5,
        strokeWeight: 1,
      }),
    );

    places.slice(0, 30).forEach((place) => {
      const kind = helpKind(place.type);
      const isMedical = kind === "hospital" || kind === "clinic";
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
      details.style.cssText = "display:block;margin-top:4px;color:#52616b;text-transform:capitalize";
      content.append(name, details);
      const marker = new maps.Marker({
        map,
        position: { lat: place.latitude, lng: place.longitude },
        title: [place.name, distanceLabel, kind].filter(Boolean).join(" · "),
        icon: isMedical
          ? {
              url: `data:image/svg+xml;utf8,${encodeURIComponent(`
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="24" cy="24" r="8" fill="#10b981" fill-opacity=".28">
                    <animate attributeName="r" values="8;22" dur="1.6s" repeatCount="indefinite"/>
                    <animate attributeName="fill-opacity" values=".35;0" dur="1.6s" repeatCount="indefinite"/>
                  </circle>
                  <circle cx="24" cy="24" r="10" fill="#10b981" stroke="#fff" stroke-width="3"/>
                  <path d="M22 16h4v6h6v4h-6v6h-4v-6h-6v-4h6z" fill="#fff"/>
                </svg>
              `)}`,
              scaledSize: new maps.Size(44, 44),
              anchor: new maps.Point(22, 22),
            }
          : {
              path: maps.SymbolPath.CIRCLE,
              scale: 7,
              fillColor: HELP_KIND_COLOR[kind],
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
      });
      marker.addListener("click", () => {
        setSelectedPlaceId(place.id);
        infoWindowRef.current?.setContent(content);
        infoWindowRef.current?.open({ map, anchor: marker });
      });
      markersRef.current.push(marker);
    });

    return () => {
      infoWindowRef.current?.close();
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
    };
  }, [center.lat, center.lng, places, useGoogle, userLocation.lat, userLocation.lng]);

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

  const fallbackZoom = 14;
  const tileX = (lng: number) => ((lng + 180) / 360) * 2 ** fallbackZoom;
  const tileY = (lat: number) => {
    const radians = (lat * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * 2 ** fallbackZoom;
  };
  const userOffset = {
    dx: (tileX(userLocation.lng) - tileX(center.lng)) * 256,
    dy: (tileY(userLocation.lat) - tileY(center.lat)) * 256,
  };
  const placeOffsets = places.slice(0, 30).map((place) => ({
    place,
    dx: (tileX(place.longitude) - tileX(center.lng)) * 256,
    dy: (tileY(place.latitude) - tileY(center.lat)) * 256,
  }));

  return (
    <div className="relative overflow-hidden rounded-[1.5rem] border border-border/60 bg-card/80 shadow-soft">
      {browserKey && !ready && !mapFailed && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-background/60 text-sm font-medium text-muted-foreground">
          Loading map…
        </div>
      )}
      {useGoogle ? (
        <div ref={containerRef} className="h-[320px] w-full" />
      ) : (
        <div ref={fallbackRef} className="relative h-[320px] w-full overflow-hidden">
          <OsmTileMap lat={center.lat} lng={center.lng} zoom={fallbackZoom} />
          <span
            aria-label="Your location"
            className="pointer-events-none absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-blue-600 shadow-[0_0_0_5px_rgba(37,99,235,0.2)]"
            style={{ left: `calc(50% + ${userOffset.dx}px)`, top: `calc(50% + ${userOffset.dy}px)` }}
          />
          {placeOffsets
            .filter(({ dx, dy }) => Math.abs(dx) < fallbackSize.width / 2 && Math.abs(dy) < fallbackSize.height / 2)
            .map(({ place, dx, dy }) => {
              const kind = helpKind(place.type);
              const medical = kind === "hospital" || kind === "clinic";
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
                  onClick={() => setSelectedPlaceId(active ? null : place.id)}
                  className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  style={{ left: `calc(50% + ${dx}px)`, top: `calc(50% + ${dy}px)` }}
                >
                  {medical ? (
                    <>
                      <span className="absolute left-1/2 top-1/2 -z-10 h-9 w-9 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-emerald-400/35 [animation-duration:1.6s]" />
                      <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-emerald-500 shadow-[0_0_10px_3px_rgba(16,185,129,0.65)]">
                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden="true">
                          <path d="M8.25 3.5h3.5v4.75h4.75v3.5h-4.75v4.75h-3.5v-4.75H3.5v-3.5h4.75z" fill="white" />
                        </svg>
                      </span>
                    </>
                  ) : (
                    <span className="block h-3.5 w-3.5 rounded-full border-2 border-white shadow" style={{ backgroundColor: HELP_KIND_COLOR[kind] }} />
                  )}
                  <span className={cn("pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-max max-w-56 -translate-x-1/2 rounded-lg bg-background/95 px-2.5 py-1.5 text-left text-[11px] font-semibold text-foreground shadow-lg", active ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")}>
                    <span className="block">{place.name}</span>
                    <span className="mt-0.5 block font-normal capitalize text-muted-foreground">{[distance, kind].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              );
            })}
          <span className="absolute bottom-2 right-2 rounded bg-background/85 px-2 py-1 text-[9px] font-medium text-muted-foreground">© OpenStreetMap contributors</span>
        </div>
      )}
    </div>
  );
}
