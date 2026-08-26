import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, MapPin, Phone, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/allma/app-shell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/nearby")({
  head: () => ({
    meta: [
      { title: "Nearby hospitals & police stations — Allma Safety AI" },
      {
        name: "description",
        content:
          "Find hospitals, police stations, fire and rescue facilities near you in Uganda, with phone numbers and 24/7 availability.",
      },
      { property: "og:title", content: "Nearby help — Allma Safety AI" },
      {
        property: "og:description",
        content: "Hospitals, police stations and rescue services near you with direct call numbers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NearbyScreen,
});

const ICONS: Record<string, string> = {
  hospital: "🏥",
  clinic: "🏥",
  police: "👮",
  fire: "🚒",
  ambulance: "🚑",
};

const TYPE_LABELS: Record<string, string> = {
  hospital: "Hospital",
  clinic: "Clinic",
  police: "Police Station",
  fire: "Fire Station",
  ambulance: "Ambulance",
};

const FILTER_TYPES = ["all", "hospital", "police", "fire", "ambulance"] as const;

function NearbyScreen() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const { data: facilities, isLoading, isError, refetch } = useQuery({
    queryKey: ["facilities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("facilities")
        .select("id, name, facility_type, address, district, phone, is_24_7")
        .order("name")
        .limit(60);
      if (error) throw error;
      return data;
    },
  });

  const filtered = (facilities ?? []).filter((f) => {
    const matchesType = filter === "all" || f.facility_type === filter;
    const q = search.toLowerCase();
    const matchesSearch = !q || f.name.toLowerCase().includes(q) || (f.district ?? "").toLowerCase().includes(q);
    return matchesType && matchesSearch;
  });

  return (
    <AppShell title="Nearby help">
      <div className="mx-auto w-full max-w-6xl px-5 pb-6 pt-6 lg:px-10 lg:pt-8">

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-black tracking-[-0.02em] lg:text-3xl">Nearby Help</h1>
            <p className="mt-1 text-[12px] text-muted-foreground lg:text-[13px]">
              Hospitals, police stations and rescue services you can reach right now.
            </p>
          </div>
          {!isLoading && facilities && (
            <span className="rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-[12px] font-semibold text-muted-foreground">
              {facilities.length} facilities
            </span>
          )}
        </div>

        {/* Search + filter bar */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search by name or district…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-full border border-border/60 bg-card/70 py-2.5 pl-9 pr-4 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-primary/50 focus:bg-card"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {FILTER_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setFilter(type)}
                className={`rounded-full border px-3.5 py-2 text-[12px] font-semibold capitalize transition-all ${
                  filter === type
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/60 bg-card/70 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {type === "all" ? "All" : TYPE_LABELS[type] ?? type}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-[1.4rem] border border-border/50 bg-card/50" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-[2rem] border border-destructive/25 bg-destructive/5 p-16 text-center">
            <MapPin className="mx-auto h-10 w-10 text-destructive/70" />
            <p className="mt-4 font-display text-lg font-bold">Nearby help could not be loaded</p>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Check your connection and try again. For urgent help, use Emergency SOS or call official services.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[2rem] border border-border/60 bg-card/70 p-16 text-center">
            <MapPin className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <p className="mt-4 font-display text-lg font-bold">No facilities found</p>
            <p className="mt-2 text-[13px] text-muted-foreground">
              {search ? "Try a different search term." : "Ask Allma in chat and it will guide you to the closest help."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((facility) => (
              <article
                key={facility.id}
                className="group flex flex-col rounded-[1.4rem] border border-border/60 bg-card/80 p-5 shadow-soft backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lift"
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-2xl transition-transform group-hover:scale-110" aria-hidden>
                    {ICONS[facility.facility_type] ?? "📍"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-bold leading-tight">{facility.name}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {[facility.address, facility.district].filter(Boolean).join(" · ") || (TYPE_LABELS[facility.facility_type] ?? facility.facility_type)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted-foreground/80">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {TYPE_LABELS[facility.facility_type] ?? facility.facility_type}
                  </span>
                  {facility.is_24_7 && (
                    <span className="flex items-center gap-1 text-gold font-semibold">
                      <Clock className="h-3 w-3" /> 24/7
                    </span>
                  )}
                </div>

                {facility.phone && (
                  <a
                    href={`tel:${facility.phone}`}
                    aria-label={`Call ${facility.name}`}
                    className="mt-4 flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow py-2.5 text-[12.5px] font-bold text-primary-foreground shadow-soft transition-all hover:opacity-90 hover:scale-[1.02]"
                  >
                    <Phone className="h-3.5 w-3.5" /> Call {facility.phone}
                  </a>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
