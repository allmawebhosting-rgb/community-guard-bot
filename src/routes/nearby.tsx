import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, MapPin, Phone, RefreshCw, Search, UserRound, UserPlus, ShieldCheck } from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/allma/app-shell";
import { ClientOnly } from "@/components/allma/client-only";
import { supabase } from "@/integrations/supabase/client";
import { getNearbyMembers, getNearbyPlaces } from "@/lib/places.functions";
import { sendConnectionRequest } from "@/lib/safety-network";
import type { NearbyMember, NearbyPlace } from "@/lib/places.types";

const NearbyMap = lazy(() => import("@/components/allma/nearby-map").then((module) => ({ default: module.NearbyMap })));

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

const DEFAULT_LOCATION = { lat: 0.3476, lng: 32.5825 };

function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function NearbyScreen() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [sendingRequestId, setSendingRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLocation(DEFAULT_LOCATION);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ lat: coords.latitude, lng: coords.longitude });
        setLocationError(null);
      },
      () => {
        setLocation(DEFAULT_LOCATION);
        setLocationError("Location access was denied, so the district list is being shown instead.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 },
    );
  }, []);

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

  const livePlacesQuery = useQuery({
    queryKey: ["nearby-places", location?.lat ?? DEFAULT_LOCATION.lat, location?.lng ?? DEFAULT_LOCATION.lng],
    enabled: Boolean(location),
    queryFn: async () => {
      const data = await getNearbyPlaces({
        data: {
          latitude: location!.lat,
          longitude: location!.lng,
          radiusMeters: 2500,
          limit: 12,
          types: ["hospital", "police", "fire_station", "clinic"],
        },
      });
      return (data ?? []) as NearbyPlace[];
    },
  });

  const nearbyMembersQuery = useQuery({
    queryKey: ["nearby-members", location?.lat ?? DEFAULT_LOCATION.lat, location?.lng ?? DEFAULT_LOCATION.lng],
    enabled: Boolean(location),
    queryFn: async () => {
      const data = await getNearbyMembers({
        data: {
          latitude: location!.lat,
          longitude: location!.lng,
          radiusMeters: 2000,
          limit: 10,
        },
      });
      return (data ?? []) as NearbyMember[];
    },
  });

  const filtered = useMemo(() => {
    const source = (facilities ?? []).filter((f) => {
      const matchesType = filter === "all" || f.facility_type === filter;
      const q = search.toLowerCase();
      const matchesSearch = !q || f.name.toLowerCase().includes(q) || (f.district ?? "").toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
    return source;
  }, [facilities, filter, search]);

  const livePlaces = useMemo(() => {
    const entries = (livePlacesQuery.data ?? []) as NearbyPlace[];
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((item) => item.name.toLowerCase().includes(q) || (item.address ?? "").toLowerCase().includes(q));
  }, [livePlacesQuery.data, search]);

  async function handleSendRequest(memberId: string) {
    setSendingRequestId(memberId);
    try {
      await sendConnectionRequest(memberId, "I’m nearby and would like to connect safely.");
      toast.success("Connection request sent");
      await nearbyMembersQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the connection request.");
    } finally {
      setSendingRequestId(null);
    }
  }

  const hasLocation = Boolean(location) && !locationError;

  const cards = useMemo(() => {
    if (hasLocation) {
      return livePlaces.map((place) => ({
        id: place.id,
        name: place.name,
        type: place.type,
        address: place.address,
        phone: place.phone,
        open_now: place.open_now,
        distance_m: place.distance_m,
        source: place.source as string,
      }));
    }
    return (filtered ?? []).map((facility) => ({
      id: facility.id,
      name: facility.name,
      type: facility.facility_type,
      address: facility.address ?? facility.district,
      phone: facility.phone,
      open_now: null as boolean | null,
      distance_m: 0,
      source: "seeded" as string,
    }));
  }, [hasLocation, livePlaces, filtered]);

  return (
    <AppShell title="Nearby help">
      <div className="mx-auto w-full max-w-6xl px-5 pb-6 pt-6 lg:px-10 lg:pt-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-black tracking-[-0.02em] lg:text-3xl">Nearby Help</h1>
            <p className="mt-1 text-[12px] text-muted-foreground lg:text-[13px]">
              Real nearby services, plus nearby members who opted in to share their presence.
            </p>
          </div>
          {!isLoading && facilities && (
            <span className="rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-[12px] font-semibold text-muted-foreground">
              {facilities.length} facilities
            </span>
          )}
        </div>

        {locationError && (
          <div className="mb-5 rounded-[1.25rem] border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-[12px] text-amber-700 dark:text-amber-300">
            {locationError}
          </div>
        )}

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

        {hasLocation ? (
          <div className="mb-6 space-y-5">
            <ClientOnly fallback={<div className="h-[320px] animate-pulse rounded-[1.5rem] border border-border/60 bg-card/70" />}>
              <Suspense fallback={<div className="h-[320px] animate-pulse rounded-[1.5rem] border border-border/60 bg-card/70" />}>
                <NearbyMap
                  center={{ lat: location!.lat, lng: location!.lng }}
                  userLocation={{ lat: location!.lat, lng: location!.lng }}
                  places={livePlaces}
                />
              </Suspense>
            </ClientOnly>
          </div>
        ) : null}

        <div className="mb-8 rounded-[1.6rem] border border-border/60 bg-card/75 p-4 shadow-soft">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Neighbours nearby</p>
              <h2 className="mt-1 font-display text-xl font-black">Active members</h2>
            </div>
            <span className="rounded-full border border-border/60 bg-background/50 px-2.5 py-1 text-[10.5px] font-semibold text-muted-foreground">
              {nearbyMembersQuery.data?.length ?? 0} nearby
            </span>
          </div>

          {nearbyMembersQuery.isLoading ? (
            <div className="rounded-[1.1rem] border border-dashed border-border/60 bg-background/40 p-4 text-[12px] text-muted-foreground">
              Checking for nearby members…
            </div>
          ) : nearbyMembersQuery.data && nearbyMembersQuery.data.length > 0 ? (
            <div className="space-y-3">
              {nearbyMembersQuery.data.map((member) => (
                <div key={member.user_id} className="flex items-center justify-between gap-3 rounded-[1.1rem] border border-border/60 bg-background/50 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt={member.full_name} className="h-full w-full object-cover" />
                      ) : (
                        member.full_name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[13px] font-semibold">{member.full_name}</p>
                        {member.phone_verified && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{formatDistance(member.distance_m)} away</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={sendingRequestId === member.user_id}
                    onClick={() => void handleSendRequest(member.user_id)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                  >
                    {sendingRequestId === member.user_id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                    {member.relationship_state === "connected" ? "Connected" : "Send request"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[1.1rem] border border-dashed border-border/60 bg-background/40 p-4 text-[12px] text-muted-foreground">
              No one nearby has opted in to share their presence right now.
            </div>
          )}
        </div>

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
            {cards.map((facility) => (
              <article
                key={facility.id}
                className="group flex flex-col rounded-[1.4rem] border border-border/60 bg-card/80 p-5 shadow-soft backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lift"
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-2xl transition-transform group-hover:scale-110" aria-hidden>
                    {facility.source === "google" ? "📍" : ICONS[facility.type] ?? "📍"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-bold leading-tight">{facility.name}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {facility.address || (TYPE_LABELS[facility.type] ?? facility.type)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted-foreground/80">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {TYPE_LABELS[facility.type] ?? facility.type}
                  </span>
                  {facility.open_now !== null && (
                    <span className="flex items-center gap-1 text-gold font-semibold">
                      <Clock className="h-3 w-3" /> {facility.open_now ? "Open now" : "Closed"}
                    </span>
                  )}
                  {facility.distance_m > 0 && (
                    <span className="ml-auto text-[10.5px] font-semibold text-primary">{formatDistance(facility.distance_m)}</span>
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
                {facility.distance_m > 0 && !facility.phone && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(facility.name)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 flex items-center justify-center gap-2 rounded-full border border-border/60 bg-background/40 py-2.5 text-[12.5px] font-bold text-foreground"
                  >
                    <MapPin className="h-3.5 w-3.5" /> Directions
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
