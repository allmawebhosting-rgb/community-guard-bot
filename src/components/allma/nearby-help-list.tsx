import { Building2, HeartPulse, Navigation2, Phone, Shield, Flame, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Shared "help near here" list (SOS screen + emergency call centre) ───────

export type HelpPlace = {
  id: string;
  name: string;
  type: string;
  address: string | null;
  phone: string | null;
  distance_m: number;
  latitude: number;
  longitude: number;
};

export type HelpKind = "hospital" | "clinic" | "police" | "fire" | "other";

export function helpKind(type: string): HelpKind {
  const value = (type ?? "").toLowerCase();
  if (value.includes("police")) return "police";
  if (value.includes("fire")) return "fire";
  if (value.includes("clinic") || value.includes("pharmac") || value.includes("doctor")) return "clinic";
  if (value.includes("hospital") || value.includes("ambulance") || value.includes("health")) return "hospital";
  return "other";
}

export const HELP_KIND_COLOR: Record<HelpKind, string> = {
  hospital: "#34d399",
  clinic: "#a3e635",
  police: "#38bdf8",
  fire: "#fb923c",
  other: "#cbd5e1",
};

const KIND_LABEL: Record<HelpKind, string> = {
  hospital: "Hospital",
  clinic: "Clinic",
  police: "Police",
  fire: "Fire",
  other: "Help",
};

const KIND_ICON: Record<HelpKind, typeof Shield> = {
  hospital: Building2,
  clinic: HeartPulse,
  police: Shield,
  fire: Flame,
  other: MapPin,
};

export function formatDistance(meters: number) {
  if (!Number.isFinite(meters)) return "";
  return meters < 950 ? `${Math.round(meters)} m away` : `${(meters / 1000).toFixed(1)} km away`;
}

export function directionsUrl(
  origin: { lat: number; lng: number } | null,
  place: { latitude: number; longitude: number },
) {
  const destination = `${place.latitude},${place.longitude}`;
  return origin
    ? `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

export function NearbyHelpList({
  places,
  loading,
  origin,
  selectedId,
  onSelect,
  tone = "dark",
  title = "Help near you",
  subtitle,
  emptyLabel = "No nearby police, clinics or hospitals were found yet.",
}: {
  places: HelpPlace[];
  loading?: boolean;
  origin: { lat: number; lng: number } | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** `dark` matches the SOS emergency screen, `surface` matches themed pages. */
  tone?: "dark" | "surface";
  title?: string;
  subtitle?: string;
  emptyLabel?: string;
}) {
  const dark = tone === "dark";

  const shell = dark
    ? "border-white/[0.08] bg-white/[0.025]"
    : "border-border/60 bg-secondary/30";
  const selectedShell = dark
    ? "border-white/25 bg-white/[0.07]"
    : "border-primary/45 bg-accent";
  const nameClass = dark ? "text-white" : "text-foreground";
  const metaClass = dark ? "text-white/55" : "text-muted-foreground";
  const strongMeta = dark ? "text-white/80" : "text-foreground/80";
  const actionClass = dark
    ? "border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08]"
    : "border-border/70 bg-secondary text-foreground hover:bg-accent";
  const headingClass = dark ? "text-white/40" : "text-muted-foreground";
  const noticeClass = dark
    ? "border-white/10 bg-white/[0.02] text-white/60"
    : "border-border/60 bg-secondary/30 text-muted-foreground";

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div className="min-w-0">
            className={cn("text-[10px] font-bold uppercase tracking-[0.2em]", headingClass)}
            {title}
          </p>
          {subtitle && (
            <p className={cn("mt-2 text-[12.5px] font-semibold", nameClass)}>{subtitle}</p>
          )}
        </div>
        {places.length > 0 && (
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]",
              dark ? "border-white/10 bg-white/[0.03] text-white/50" : "border-border/60 text-muted-foreground",
            )}
          >
            {places.length} found
          </span>
        )}
      </div>

      {loading ? (
        <div className={cn("mt-3 rounded-2xl border p-4 text-[12px]", noticeClass)}>
          Finding police, clinics and hospitals nearby…
        </div>
      ) : places.length === 0 ? (
        <div className={cn("mt-3 rounded-2xl border p-4 text-[12px]", noticeClass)}>{emptyLabel}</div>
      ) : (
        <ul className="mt-4 max-h-[34rem] space-y-2.5 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
          {places.map((place) => {
            const kind = helpKind(place.type);
            const Icon = KIND_ICON[kind];
            const selected = selectedId === place.id;
            const tel = place.phone ? place.phone.replace(/[^\d+]/g, "") : null;
            return (
              <li
                key={place.id}
                id={`help-place-${place.id}`}
                onClick={() => onSelect?.(place.id)}
                className={cn(
                  "rounded-xl border p-3.5 transition duration-200 hover:-translate-y-px hover:shadow-sm",
                  shell,
                  selected && selectedShell,
                  onSelect && "cursor-pointer",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                    style={{
                      backgroundColor: `${HELP_KIND_COLOR[kind]}1f`,
                      color: HELP_KIND_COLOR[kind],
                    }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                      <p className={cn("min-w-0 break-words text-[13px] font-bold leading-snug", nameClass)}>{place.name}</p>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]"
                        style={{
                          backgroundColor: `${HELP_KIND_COLOR[kind]}1f`,
                          color: HELP_KIND_COLOR[kind],
                        }}
                      >
                        {KIND_LABEL[kind]}
                      </span>
                    </div>
                    {place.address && (
                      <p className={cn("mt-1 flex items-center gap-1 text-[11px]", metaClass)}>
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="line-clamp-2">{place.address}</span>
                      </p>
                    )}
                    <p className={cn("mt-1 text-[11px] font-semibold", strongMeta)}>
                      {formatDistance(place.distance_m)}
                      {place.phone ? ` · ${place.phone}` : ""}
                    </p>
                  </div>
                </div>

                <div className={cn("mt-3 grid gap-2", tel ? "grid-cols-2" : "grid-cols-1")}>
                  <a
                    href={directionsUrl(origin, place)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className={cn(
                      "flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-[11px] font-bold transition",
                      actionClass,
                    )}
                  >
                    <Navigation2 className="h-3.5 w-3.5" /> Directions
                  </a>
                  {tel && (
                    <a
                      href={`tel:${tel}`}
                      onClick={(event) => event.stopPropagation()}
                      className={cn(
                        "flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-[11px] font-bold transition",
                        actionClass,
                      )}
                    >
                      <Phone className="h-3.5 w-3.5" /> Call
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
