import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { incidentsQuery, PRIORITY_META, timeAgo, type IncidentPriority } from "@/lib/police";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/map")({
  component: LiveMapPage,
});

// Uganda bounding box for the schematic operations map.
const BOUNDS = { minLat: -1.5, maxLat: 4.3, minLng: 29.5, maxLng: 35.1 };

function LiveMapPage() {
  const { data: incidents = [] } = useQuery(incidentsQuery);
  const pins = incidents.filter((i) => i.latitude != null && i.longitude != null);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
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
            const left =
              ((incident.longitude! - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 100;
            const top =
              (1 - (incident.latitude! - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100;
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
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {pins.slice(0, 9).map((incident) => {
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
                {incident.location_text ?? incident.district}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
