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
  onFail,
}: {
  lat: number;
  lng: number;
  zoom: number;
  onFail: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

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

  return <div ref={containerRef} className="absolute inset-0" aria-hidden />;
}

export function LiveLocationMap({
  location,
  badge = "Live",
  directionsLabel = "Open in Google Maps",
  directions = false,
  heightClassName = "h-52 lg:h-[19rem]",
}: {
  location: LiveLocationPoint;
  /** Small label shown in the map corner. */
  badge?: string;
  directionsLabel?: string;
  /** Use a navigation (directions) link instead of a plain map pin link. */
  directions?: boolean;
  /** Height utilities for the map canvas (responsive by default). */
  heightClassName?: string;
}) {
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [canvasHeight, setCanvasHeight] = useState(208);
  const level = MAP_ZOOM_LEVELS[zoom];
  const accuracy = typeof location.accuracy === "number" ? location.accuracy : null;

  const tileZoom = [18, 16, 14, 12][zoom] ?? 16;
  const useGoogle =
    Boolean(getGoogleMapsBrowserKey()) && !googleFailed && !googleMapsAuthFailed();

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const measure = () => {
      const next = node.getBoundingClientRect().height;
      if (next > 0) setCanvasHeight(next);
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

  return (
    <div className="premium-surface shadow-soft overflow-hidden rounded-2xl border border-border/60">
      <div ref={canvasRef} className={cn("relative bg-muted", heightClassName)}>
        {useGoogle ? (
          <GoogleLocationCanvas
            lat={location.lat}
            lng={location.lng}
            zoom={tileZoom}
            onFail={() => setGoogleFailed(true)}
          />
        ) : (
          <OsmTileMap lat={location.lat} lng={location.lng} zoom={tileZoom} />
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

        <div className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground backdrop-blur-md">
          <LocateFixed className="h-3 w-3 text-success" />
          {badge} · {level.label}
          {accuracy !== null ? ` · ±${Math.round(accuracy)} m` : ""}
        </div>
      </div>

      {(location.address || location.district) && (
        <div className="flex items-start gap-2 border-t border-border/60 px-4 py-3">
          <Navigation2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold text-foreground">
              {location.address}
              {location.address && location.district ? ", " : ""}
              {location.district}
            </p>
            <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{coords}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 border-t border-border/60 p-2.5">
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
