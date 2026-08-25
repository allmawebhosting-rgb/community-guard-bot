import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, MapPin, RefreshCw } from "lucide-react";
import { incidentsQuery, PRIORITY_META, statusLabel, timeAgo, type IncidentPriority } from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/map")({
  component: LiveMapPage,
});

// Uganda bounding box for the schematic operations map.
const BOUNDS = { minLat: -1.5, maxLat: 4.3, minLng: 29.5, maxLng: 35.1 };

function LiveMapPage() {
  const { data: incidents = [], isLoading, isError, refetch } = useQuery(incidentsQuery);
  const pins = incidents.filter((i) => i.latitude != null && i.longitude != null);

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-xs text-primary">Operations geospatial view</p>
          <h1 className="mt-1 font-display text-xl font-bold">Live incident map</h1>
          <p className="mt-1 text-sm text-foreground/75">Review reported locations and open the related case.</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-foreground/75">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /> Critical</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-alert" /> High</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" /> Other</span>
        </div>
      </div>

      <div className="premium-surface relative overflow-hidden rounded-3xl border border-border/55 shadow-lift">
        <div className="signal-streak relative aspect-4/3 w-full sm:aspect-video">
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          {pins.map((incident) => {
            const meta = PRIORITY_META[incident.priority as IncidentPriority];
            const left = Math.max(2, Math.min(98, ((incident.longitude! - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 100));
            const top = Math.max(2, Math.min(98, (1 - (incident.latitude! - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100));
            return (
              <Link
                key={incident.id}
                to="/police/cases/$caseId"
                params={{ caseId: incident.id }}
                className="group absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${left}%`, top: `${top}%` }}
              >
                <span className={cn("block h-3 w-3 rounded-full ring-4 ring-background/70", meta.dot)} />
                <span className="pointer-events-none absolute left-4 top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-full border border-border/60 bg-card/95 px-2.5 py-1 text-[10px] shadow-soft group-hover:block">
                  {incident.title}
                </span>
              </Link>
            );
          })}
          {isLoading && <MapState icon={RefreshCw} title="Loading live incidents" text="Connecting to the authorized incident feed..." spinning />}
          {isError && <MapState icon={AlertTriangle} title="Map data unavailable" text="The incident feed could not be loaded. Retry the connection to refresh this view." action={{ label: "Retry", onClick: () => void refetch() }} />}
          {!isLoading && !isError && pins.length === 0 && <MapState icon={MapPin} title="No GPS locations yet" text={incidents.length ? `${incidents.length} incident${incidents.length === 1 ? " has" : "s have"} been reported, but none include shareable coordinates.` : "No incidents are currently available in the live feed."} />}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(pins.length ? pins : incidents).slice(0, 9).map((incident) => {
          const meta = PRIORITY_META[incident.priority as IncidentPriority];
          return (
            <Link
              key={incident.id}
              to="/police/cases/$caseId"
              params={{ caseId: incident.id }}
              className="premium-surface rounded-2xl border border-border/55 p-3 shadow-soft transition hover:border-border"
            >
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                <p className="min-w-0 flex-1 truncate text-xs font-medium">{incident.title}</p>
                <span className="text-[10px] text-muted-foreground">{timeAgo(incident.created_at)}</span>
              </div>
              <p className="mt-1 truncate pl-4 text-[11px] text-muted-foreground">
                {incident.location_text ?? incident.district ?? "Location not shared"}
              </p>
              {!pins.includes(incident) && <p className="mt-1 pl-4 text-[10px] text-alert">Map pin unavailable · coordinates not shared</p>}
            </Link>
          );
        })}
        {!isLoading && !isError && incidents.length === 0 && <p className="col-span-full rounded-2xl border border-border/60 bg-card/70 p-6 text-center text-sm text-foreground/75">No incidents available.</p>}
      </div>
    </div>
  );
}

function MapState({ icon: Icon, title, text, spinning, action }: { icon: typeof MapPin; title: string; text: string; spinning?: boolean; action?: { label: string; onClick: () => void } }) {
  return <div className="absolute inset-0 grid place-items-center bg-background/35 p-6 text-center backdrop-blur-[2px]"><div className="max-w-sm rounded-2xl border border-border/70 bg-card/95 px-5 py-4 shadow-lift"><Icon className={cn("mx-auto h-6 w-6 text-gold", spinning && "animate-spin")} /><p className="mt-2 text-sm font-semibold text-foreground">{title}</p><p className="mt-1 text-xs leading-relaxed text-foreground/75">{text}</p>{action && <button type="button" onClick={action.onClick} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-primary/60 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">{action.label}</button>}</div></div>;
}
