import { useState } from "react";
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

const MAP_HEIGHT = 208;
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

  const xExact = lngToTileX(lng, zoom);
  const yExact = latToTileY(lat, zoom);
  const max = 2 ** zoom;
  const cx = Math.floor(xExact);
  const cy = Math.floor(yExact);

  const tiles: { key: string; url: string; left: number; top: number }[] = [];
  for (let dx = -2; dx <= 2; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
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

  if (failed) return null;

  return (
    <div className="map-tint absolute inset-0 overflow-hidden" aria-hidden>
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

export function LiveLocationMap({
  location,
  badge = "Live",
  directionsLabel = "Open in Google Maps",
  directions = false,
}: {
  location: LiveLocationPoint;
  /** Small label shown in the map corner. */
  badge?: string;
  directionsLabel?: string;
  /** Use a navigation (directions) link instead of a plain map pin link. */
  directions?: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);
  const level = MAP_ZOOM_LEVELS[zoom];
  const accuracy = typeof location.accuracy === "number" ? location.accuracy : null;

  const tileZoom = [18, 16, 14, 12][zoom] ?? 16;

  // Accuracy circle drawn to the same scale as the tiles.
  const metresPerPixel = level.span / MAP_HEIGHT;
  const accuracyPx =
    accuracy === null
      ? 0
      : Math.max(18, Math.min(MAP_HEIGHT * 0.9, (accuracy / metresPerPixel) * 2));

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
      <div className="relative bg-muted" style={{ height: MAP_HEIGHT }}>
        <OsmTileMap lat={location.lat} lng={location.lng} zoom={tileZoom} />

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
