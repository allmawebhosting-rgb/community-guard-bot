import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  CircleAlert,
  Flame,
  Hospital,
  Map,
  MapPin,
  Navigation,
  Radio,
  Search,
  Shield,
  Users,
} from "lucide-react";
import { incidentsQuery, stationsQuery, timeAgo, type Incident, type PoliceStation } from "@/lib/police";
import { hierarchyNodesQuery } from "@/lib/institutional";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/locations")({
  component: LocationsPage,
});

const BOUNDS = { minLat: -1.5, maxLat: 4.3, minLng: 29.5, maxLng: 35.1 };
const FILTERS = ["all", "incident", "allma", "police", "medical", "fire", "security", "community", "other"] as const;
type LocationType = (typeof FILTERS)[number];

type LocationRecord = {
  id: string;
  name: string;
  type: Exclude<LocationType, "all" | "incident">;
  organization: string;
  region: string;
  district: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  status: "Operational" | "Available" | "Listed only" | "Verified location" | "Demo / simulation";
  integration: "Not connected" | "Verified location" | "Partner" | "Authorized integration";
  coverage: string;
  demo?: boolean;
  source?: PoliceStation;
};

const DEMO_LOCATIONS: LocationRecord[] = [
  { id: "demo-allma-national", name: "Allma National Operations Center", type: "allma", organization: "Allma Safety Operations", region: "National", district: "Kampala", address: "Demo operations center", latitude: 0.3476, longitude: 32.5825, status: "Demo / simulation", integration: "Authorized integration", coverage: "National", demo: true },
  { id: "demo-jinja-office", name: "Demo Jinja Operations Office", type: "allma", organization: "Allma Safety Operations", region: "Eastern Uganda", district: "Jinja", address: "Demo operations office", latitude: 0.4479, longitude: 33.2026, status: "Demo / simulation", integration: "Authorized integration", coverage: "Jinja City", demo: true },
  { id: "demo-medical", name: "Demo Medical Center", type: "medical", organization: "External Healthcare Organization", region: "Eastern Uganda", district: "Jinja", address: "Demo facility", latitude: 0.445, longitude: 33.21, status: "Demo / simulation", integration: "Not connected", coverage: "Jinja District", demo: true },
  { id: "demo-fire", name: "Demo Fire Station", type: "fire", organization: "External Fire & Rescue Organization", region: "Eastern Uganda", district: "Jinja", address: "Demo facility", latitude: 0.43, longitude: 33.19, status: "Demo / simulation", integration: "Not connected", coverage: "Jinja District", demo: true },
  { id: "demo-community", name: "Demo Community Response Point", type: "community", organization: "Allma Community Network", region: "Eastern Uganda", district: "Jinja", address: "Demo response point", latitude: 0.46, longitude: 33.22, status: "Demo / simulation", integration: "Verified location", coverage: "5 km radius", demo: true },
];

function LocationsPage() {
  const { data: stations = [], isLoading: stationsLoading } = useQuery(stationsQuery);
  const { data: incidents = [], isLoading: incidentsLoading } = useQuery(incidentsQuery);
  const { data: hierarchy = [] } = useQuery(hierarchyNodesQuery);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LocationType>("all");
  const [demoMode, setDemoMode] = useState(false);
  const [view, setView] = useState<"map" | "list">("map");

  const realLocations = useMemo<LocationRecord[]>(() => stations.map((station) => ({
    id: station.id,
    name: station.name,
    type: "police",
    organization: "External Police Organization",
    region: station.region ?? "Uganda",
    district: station.district ?? "Unassigned",
    address: [station.parish, station.sub_county, station.village].filter(Boolean).join(", ") || station.district || "Address not listed",
    latitude: station.latitude,
    longitude: station.longitude,
    status: station.latitude != null ? "Verified location" : "Listed only",
    integration: "Not connected",
    coverage: station.coverage_area ?? station.district ?? "Coverage not defined",
    source: station,
  })), [stations]);

  const locations = demoMode ? [...DEMO_LOCATIONS, ...realLocations] : realLocations;
  const rows = locations.filter((location) => {
    if (filter !== "all" && filter !== location.type) return false;
    if (!query.trim()) return true;
    const needle = query.toLowerCase();
    return [location.name, location.organization, location.region, location.district, location.address, location.coverage]
      .filter(Boolean).some((value) => value.toLowerCase().includes(needle));
  });
  const visibleIncidents = incidents.filter((incident) => !["resolved", "closed"].includes(incident.status));
  const allmaCount = locations.filter((location) => location.type === "allma").length;
  const medicalCount = locations.filter((location) => location.type === "medical").length;
  const fireCount = locations.filter((location) => location.type === "fire").length;
  const partnerCount = locations.filter((location) => ["Partner", "Authorized integration"].includes(location.integration)).length;

  return (
    <div className="w-full space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-xs text-primary">Allma safety network</p>
          <h1 className="mt-1 font-display text-2xl font-black tracking-[-0.04em]">Locations &amp; Safety Network</h1>
          <p className="mt-1 max-w-2xl text-sm text-foreground/75">Manage operational offices, safety facilities, responders, and authorized coordination points.</p>
        </div>
        <button type="button" onClick={() => setDemoMode((value) => !value)} className={cn("rounded-full border px-3.5 py-2 text-xs font-semibold", demoMode ? "border-gold/60 bg-gold/15 text-gold" : "border-border/70 bg-secondary/70 text-foreground/85")}>
          {demoMode ? "DEMO / SIMULATION ON" : "Show demo locations"}
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Metric label="Total locations" value={locations.length} icon={MapPin} />
        <Metric label="Allma offices" value={allmaCount} icon={Building2} tone="primary" />
        <Metric label="Police" value={locations.filter((location) => location.type === "police").length} icon={Shield} tone="primary" />
        <Metric label="Medical" value={medicalCount} icon={Hospital} tone="success" />
        <Metric label="Fire & rescue" value={fireCount} icon={Flame} tone="alert" />
        <Metric label="Community" value={locations.filter((location) => location.type === "community").length} icon={Users} tone="success" />
        <Metric label="Partners" value={partnerCount} icon={CheckCircle2} tone="gold" />
      </div>

      <section className="card-desktop space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/70" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search location, organization, district..." className="h-10 w-full rounded-full border border-border/70 bg-background/70 pl-9 pr-4 text-sm text-foreground outline-none placeholder:text-foreground/55 focus:border-primary" />
          </div>
          <div className="flex rounded-full border border-border/70 bg-secondary/60 p-1">
            <button type="button" onClick={() => setView("map")} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", view === "map" ? "bg-primary text-primary-foreground" : "text-foreground/75")}>Map view</button>
            <button type="button" onClick={() => setView("list")} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", view === "list" ? "bg-primary text-primary-foreground" : "text-foreground/75")}>List view</button>
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold capitalize", filter === item ? "border-primary/60 bg-primary/15 text-primary" : "border-border/70 bg-secondary/60 text-foreground/75")}>{item === "allma" ? "Allma" : item}</button>)}
        </div>
      </section>

      {view === "map" ? <LocationMap incidents={visibleIncidents} locations={rows} loading={stationsLoading || incidentsLoading} /> : <LocationList rows={rows} />}

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="card-desktop">
          <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-bold">Nearby / recent locations</h2><p className="mt-1 text-xs text-foreground/70">Only listed, verified, partner, and authorized statuses are shown.</p></div><Link to="/police/dispatch" className="text-xs font-semibold text-primary">Coordinate <Navigation className="ml-1 inline h-3 w-3" /></Link></div>
          <div className="space-y-2">{rows.slice(0, 5).map((location) => <LocationRow key={location.id} location={location} />)}{rows.length === 0 && <p className="py-6 text-center text-sm text-foreground/70">No locations match this search.</p>}</div>
        </div>
        <div className="card-desktop"><h2 className="text-sm font-bold">Network readiness</h2><div className="mt-3 space-y-2 text-xs text-foreground/75"><Readiness label="Operational / available" value={locations.filter((location) => ["Operational", "Available"].includes(location.status)).length} tone="success" /><Readiness label="Pending verification" value={locations.filter((location) => location.status === "Listed only").length} tone="gold" /><Readiness label="Partner connected" value={partnerCount} tone="primary" /><Readiness label="Covered districts" value={new Set([...locations.map((location) => location.district), ...hierarchy.filter((node) => node.is_active).map((node) => node.district).filter(Boolean)]).size} tone="neutral" /></div><p className="mt-4 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-foreground/70">External facilities remain independent unless an authorized partnership or technical integration is explicitly recorded.</p></div>
      </section>
    </div>
  );
}

function LocationMap({ incidents, locations, loading }: { incidents: Incident[]; locations: LocationRecord[]; loading: boolean }) {
  return <section className="premium-surface overflow-hidden rounded-3xl border border-border/60 shadow-lift"><div className="flex items-center justify-between border-b border-border/60 px-4 py-3"><div><h2 className="flex items-center gap-2 text-sm font-bold"><Map className="h-4 w-4 text-primary" /> Live safety map</h2><p className="mt-1 text-xs text-foreground/70">Approximate operational locations. Exact responder locations remain protected.</p></div><span className="flex items-center gap-1.5 text-[11px] font-semibold text-success"><Radio className="h-3 w-3" /> Live directory</span></div><div className="signal-streak relative aspect-[16/9] min-h-[280px] w-full"><div className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />{incidents.map((incident) => <Marker key={`incident-${incident.id}`} latitude={incident.latitude} longitude={incident.longitude} label={incident.title} type="incident" />)}{locations.map((location) => <Marker key={location.id} latitude={location.latitude} longitude={location.longitude} label={location.name} type={location.type} />)}{loading && <MapOverlay title="Loading safety network" text="Connecting to the authorized directory..." />}{!loading && !incidents.some((incident) => incident.latitude != null && incident.longitude != null) && locations.every((location) => location.latitude == null || location.longitude == null) && <MapOverlay title="No mapped locations yet" text="Locations without shareable GPS coordinates remain available in the list below." />}</div></section>;
}

function Marker({ latitude, longitude, label, type }: { latitude: number | null; longitude: number | null; label: string; type: LocationType }) {
  if (latitude == null || longitude == null) return null;
  const left = Math.max(2, Math.min(98, ((longitude - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 100));
  const top = Math.max(2, Math.min(98, (1 - (latitude - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100));
  const Icon = type === "incident" ? CircleAlert : type === "medical" ? Hospital : type === "fire" ? Flame : type === "community" ? Users : type === "allma" ? Building2 : Shield;
  return <div className="group absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%`, top: `${top}%` }}><span className={cn("grid h-8 w-8 place-items-center rounded-full border-2 border-background shadow-lift", type === "incident" ? "bg-primary text-white" : type === "medical" || type === "community" ? "bg-success text-white" : type === "fire" ? "bg-alert text-alert-foreground" : "bg-secondary text-foreground")}><Icon className="h-4 w-4" /></span><span className="pointer-events-none absolute left-10 top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-border/70 bg-card px-2.5 py-1.5 text-[10px] font-semibold text-foreground shadow-soft group-hover:block">{label}</span></div>;
}

function MapOverlay({ title, text }: { title: string; text: string }) { return <div className="absolute inset-0 grid place-items-center bg-background/35 p-6 text-center"><div className="rounded-2xl border border-border/70 bg-card/95 px-5 py-4 shadow-lift"><MapPin className="mx-auto h-6 w-6 text-gold" /><p className="mt-2 text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-foreground/70">{text}</p></div></div>; }

function LocationList({ rows }: { rows: LocationRecord[] }) { return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((location) => <LocationRow key={location.id} location={location} card />)}</div>; }
function LocationRow({ location, card = false }: { location: LocationRecord; card?: boolean }) { return <div className={cn("flex items-start gap-3", card ? "card-desktop" : "rounded-xl border border-border/60 bg-secondary/35 p-3")}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary"><MapPin className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-bold">{location.name}</p>{location.demo && <span className="shrink-0 rounded-full border border-gold/50 bg-gold/12 px-1.5 py-0.5 text-[9px] font-bold text-gold">DEMO</span>}</div><p className="mt-1 text-[11px] font-semibold capitalize text-foreground/75">{location.type} · {location.organization}</p><p className="mt-1 truncate text-[11px] text-foreground/70">{location.address} · {location.district} · {location.coverage}</p><div className="mt-2 flex flex-wrap gap-1.5"><span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", location.status === "Listed only" ? "border-gold/40 bg-gold/10 text-gold" : location.status === "Demo / simulation" ? "border-gold/40 bg-gold/10 text-gold" : "border-success/40 bg-success/10 text-success")}>{location.status}</span><span className="rounded-full border border-border/70 bg-background/60 px-2 py-0.5 text-[10px] font-semibold text-foreground/75">{location.integration}</span></div></div></div>; }

function Metric({ label, value, icon: Icon, tone = "neutral" }: { label: string; value: number; icon: typeof MapPin; tone?: "neutral" | "primary" | "success" | "alert" | "gold" }) { return <div className="card-desktop min-w-0"><div className="flex items-center justify-between gap-2"><p className="label-xs truncate text-foreground/75">{label}</p><Icon className={cn("h-4 w-4 shrink-0", tone === "primary" ? "text-primary" : tone === "success" ? "text-success" : tone === "alert" ? "text-alert" : tone === "gold" ? "text-gold" : "text-foreground/70")} /></div><p className="mt-2 font-display text-2xl font-black tabular-nums">{value}</p></div>; }
function Readiness({ label, value, tone }: { label: string; value: number; tone: "success" | "gold" | "primary" | "neutral" }) { return <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/50 px-3 py-2"><span>{label}</span><strong className={tone === "success" ? "text-success" : tone === "gold" ? "text-gold" : tone === "primary" ? "text-primary" : "text-foreground"}>{value}</strong></div>; }
