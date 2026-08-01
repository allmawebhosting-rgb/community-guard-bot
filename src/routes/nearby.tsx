import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, MapPin, Phone } from "lucide-react";
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

function NearbyScreen() {
  const { data: facilities, isLoading } = useQuery({
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

  return (
    <AppShell title="Nearby help">
      <div className="px-4 pt-5 pb-6">
        <h1 className="font-display text-xl font-black tracking-[-0.02em]">Nearby help</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Hospitals, police stations and rescue services you can reach right now.
        </p>

        <div className="mt-5 space-y-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-[1.4rem] border border-border/50 bg-card/50" />
            ))
          ) : !facilities || facilities.length === 0 ? (
            <p className="rounded-[1.4rem] border border-border/60 bg-card/70 p-8 text-center text-sm text-muted-foreground">
              No facilities listed yet. Ask Allma in chat and it will guide you to the closest help.
            </p>
          ) : (
            facilities.map((facility) => (
              <article
                key={facility.id}
                className="flex items-center gap-3 rounded-[1.4rem] border border-border/60 bg-card/80 p-3.5 shadow-soft backdrop-blur-sm"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-xl" aria-hidden>
                  {ICONS[facility.facility_type] ?? "📍"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold">{facility.name}</p>
                  <p className="truncate text-[11.5px] text-muted-foreground">
                    {[facility.address, facility.district].filter(Boolean).join(" · ") || facility.facility_type}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-[10.5px] text-muted-foreground/80">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {facility.facility_type}
                    </span>
                    {facility.is_24_7 && (
                      <span className="flex items-center gap-1 text-gold">
                        <Clock className="h-3 w-3" /> 24/7
                      </span>
                    )}
                  </div>
                </div>
                {facility.phone && (
                  <a
                    href={`tel:${facility.phone}`}
                    aria-label={`Call ${facility.name}`}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                )}
              </article>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
