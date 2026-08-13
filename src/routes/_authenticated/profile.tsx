import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Bell, ChevronRight, FileText, LogOut, MapPin, MessageSquare,
  Moon, Shield, Sun, UserRound, Users, LocateFixed, Loader2, Check, X,
  Navigation, CheckCircle2,
} from "lucide-react";
import { AppShell } from "@/components/allma/app-shell";
import { MascotAvatar } from "@/components/allma/mascot";
import { SafetyNetworkPanel } from "@/components/allma/safety-network/safety-network-panel";
import { CallHistory } from "@/components/allma/calls/call-history";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/lib/theme";
import { DISCLAIMER } from "@/lib/allma";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My profile — Allma Safety AI" },
      {
        name: "description",
        content: "Manage your Allma Safety AI account, review your reporting activity and app preferences.",
      },
      { property: "og:title", content: "My profile — Allma Safety AI" },
      { property: "og:description", content: "Manage your account, activity and preferences in Allma Safety AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfileScreen,
});

function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [responderAvailable, setResponderAvailable] = useState(false);
  const [responderSaving, setResponderSaving] = useState(false);
  const [sosOffers, setSosOffers] = useState<SosOffer[]>([]);
  const [offerSaving, setOfferSaving] = useState<string | null>(null);
  const responderWatch = useRef<number | null>(null);
  const responderTable = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => { eq: (column: string, value: string) => { maybeSingle: () => Promise<{ data: { is_available: boolean } | null }> } };
      upsert: (values: Record<string, unknown>, options?: Record<string, unknown>) => Promise<{ error: unknown }>;
      update: (values: Record<string, unknown>) => { eq: (column: string, value: string) => Promise<{ error: unknown }> };
    };
  };
  const offerClient = supabase as unknown as {
    rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };

  type SosOffer = {
    offer_id: string;
    sos_activity_id: string;
    emergency_type: string;
    area: string;
    distance_m: number;
    status: "offered" | "accepted" | "declined" | "en_route" | "arrived" | "cancelled";
    created_at: string;
  };

  const offerStatusLabel: Record<SosOffer["status"], string> = {
    offered: "Needs a response",
    accepted: "Accepted",
    declined: "Declined",
    en_route: "En route",
    arrived: "Arrived",
    cancelled: "Cancelled",
  };

  const offerStatusClass: Record<SosOffer["status"], string> = {
    offered: "bg-amber-500/12 text-amber-600 dark:text-amber-300",
    accepted: "bg-blue-500/12 text-blue-600 dark:text-blue-300",
    declined: "bg-red-500/12 text-red-600 dark:text-red-300",
    en_route: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300",
    arrived: "bg-green-500/12 text-green-600 dark:text-green-300",
    cancelled: "bg-muted text-muted-foreground",
  };

  function formatOfferDistance(meters: number) {
    return meters < 1000 ? `${Math.round(meters)} m away` : `${(meters / 1000).toFixed(1)} km away`;
  }

  async function updateOffer(offerId: string, nextStatus: SosOffer["status"]) {
    setOfferSaving(offerId);
    const { error } = await offerClient.rpc("respond_to_sos_offer", {
      p_offer_id: offerId,
      p_status: nextStatus,
    });
    if (error) {
      console.error("Failed to update SOS offer", error);
    } else {
      setSosOffers((current) => current.map((offer) => (
        offer.offer_id === offerId ? { ...offer, status: nextStatus } : offer
      )));
    }
    setOfferSaving(null);
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void responderTable.from("community_responder_locations")
      .select("is_available")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setResponderAvailable(Boolean(data?.is_available));
      });
    return () => {
      cancelled = true;
      if (responderWatch.current !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(responderWatch.current);
      }
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function loadOffers() {
      const { data, error } = await offerClient.rpc("get_my_sos_offers");
      if (!cancelled && !error) setSosOffers((data as SosOffer[] | null) ?? []);
      if (error) console.error("Failed to load SOS offers", error);
    }

    void loadOffers();
    const channel = supabase
      .channel(`sos-responder-inbox-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "sos_responder_offers",
        filter: `responder_id=eq.${user.id}`,
      }, (payload) => {
        const next = payload.new as Partial<SosOffer> & { id?: string };
        if (!next.id) return;
        setSosOffers((current) => {
          const existing = current.find((offer) => offer.offer_id === next.id);
          if (!existing) {
            void loadOffers();
            return current;
          }
          return current.map((offer) => offer.offer_id === next.id
            ? { ...offer, status: (next.status as SosOffer["status"]) ?? offer.status }
            : offer);
        });
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [user]);

  async function setResponderMode(enabled: boolean) {
    if (!user) return;
    setResponderSaving(true);
    if (!enabled) {
      if (responderWatch.current !== null) navigator.geolocation.clearWatch(responderWatch.current);
      responderWatch.current = null;
      const { error } = await responderTable.from("community_responder_locations")
        .update({ is_available: false, last_seen_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (error) console.error("Failed to disable responder presence", error);
      setResponderAvailable(false);
      setResponderSaving(false);
      return;
    }

    if (!("geolocation" in navigator)) {
      setResponderSaving(false);
      return;
    }

    responderWatch.current = navigator.geolocation.watchPosition(
      async ({ coords }) => {
        const { error } = await responderTable.from("community_responder_locations").upsert({
          user_id: user.id,
          latitude: coords.latitude,
          longitude: coords.longitude,
          is_available: true,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        if (error) console.error("Failed to update responder presence", error);
        setResponderAvailable(!error);
        setResponderSaving(false);
      },
      () => {
        setResponderAvailable(false);
        setResponderSaving(false);
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 },
    );
  }

  const { data: stats } = useQuery({
    queryKey: ["profile-stats"],
    queryFn: async () => {
      const [reports, emergencies] = await Promise.all([
        supabase.from("reports").select("id", { count: "exact", head: true }),
        supabase.from("reports").select("id", { count: "exact", head: true }).eq("report_type", "emergency"),
      ]);
      return { reports: reports.count ?? 0, emergencies: emergencies.count ?? 0 };
    },
  });

  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Community member";
  const initials = name.split(" ").map((p: string) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <AppShell title="Profile">
      <div className="mx-auto w-full max-w-6xl px-5 pb-6 pt-6 lg:px-10 lg:pt-8">

        {/* Page header */}
        <h1 className="mb-6 font-display text-2xl font-black tracking-[-0.02em] lg:text-3xl">My Profile</h1>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr] lg:items-start">

          {/* Left column: user card + stats */}
          <div className="space-y-4">
            {/* User card */}
            <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card/80 p-6 shadow-soft backdrop-blur-sm">
              <div className="absolute inset-0 hero-glow opacity-40 pointer-events-none" />
              <div className="relative flex flex-col items-center gap-4 text-center">
                <MascotAvatar className="h-20 w-20" />
                <div>
                  <p className="font-display text-[19px] font-black tracking-[-0.02em]">{name}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">{user?.email}</p>
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/50 px-3 py-1 text-[11px] font-semibold text-muted-foreground">
                    <UserRound className="h-3 w-3" /> Community member
                  </span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[1.4rem] border border-border/60 bg-card/70 p-5 text-center">
                <p className="font-display text-3xl font-black text-primary">{stats?.reports ?? 0}</p>
                <p className="mt-1 text-[11.5px] font-semibold text-muted-foreground">Reports filed</p>
              </div>
              <div className="rounded-[1.4rem] border border-gold/25 bg-gold/[0.07] p-5 text-center">
                <p className="font-display text-3xl font-black text-gold">{stats?.emergencies ?? 0}</p>
                <p className="mt-1 text-[11.5px] font-semibold text-muted-foreground">Emergencies raised</p>
              </div>
            </div>

            {/* Account info */}
            <div className="rounded-[1.4rem] border border-border/60 bg-card/70 p-4">
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Account</p>
              <div className="space-y-2 text-[13px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium truncate max-w-[160px]">{user?.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Member since</span>
                  <span className="font-medium">
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString("en-UG", { month: "short", year: "numeric" }) : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right column: navigation + actions */}
          <div className="space-y-4">
            {/* Quick links */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Quick links</p>
              <nav className="overflow-hidden rounded-[1.4rem] border border-border/60 bg-card/70">
                {[
                  { to: "/chat", icon: MessageSquare, label: "Start a conversation", desc: "Chat with Allma Safety AI" },
                  { to: "/reports", icon: FileText, label: "My reports", desc: "View your filed cases and references" },
                  { to: "/alerts", icon: Bell, label: "Community alerts", desc: "Live safety notices for your area" },
                  { to: "/nearby", icon: MapPin, label: "Nearby help", desc: "Find hospitals and police stations" },
                  { to: "/responder", icon: Users, label: "Community responder", desc: "Opt in safely to help nearby people" },
                  { to: "/police", icon: Shield, label: "Police command center", desc: "For verified officers only" },
                ].map(({ to, icon: Icon, label, desc }, idx, arr) => (
                  <Link
                    key={to}
                    to={to as "/chat"}
                    className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent ${idx < arr.length - 1 ? "border-b border-border/50" : ""}`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold">{label}</span>
                      <span className="block text-[11.5px] text-muted-foreground">{desc}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  </Link>
                ))}
              </nav>
            </div>

            {/* Responder inbox */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                Safety network
              </p>
              <div className="mb-4 rounded-[1.4rem] border border-border/60 bg-card/70 p-4">
                <SafetyNetworkPanel />
              </div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                Allma calls
              </p>
              <div className="mb-3 rounded-[1.4rem] border border-border/60 bg-card/70 p-4">
                <CallHistory />
              </div>
              <div className="mb-4">
                <BackgroundCallAlerts />
              </div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Nearby SOS alerts</p>
                {sosOffers.some((offer) => offer.status === "offered") && (
                  <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-300">
                    Action needed
                  </span>
                )}
              </div>
              <div className="space-y-2.5">
                {sosOffers.length === 0 ? (
                  <div className="rounded-[1.4rem] border border-dashed border-border/70 bg-card/40 px-5 py-4">
                    <p className="text-[13px] font-semibold">No nearby SOS alerts</p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                      Turn on “Help neighbors nearby” below to receive alerts when someone close needs help.
                    </p>
                  </div>
                ) : (
                  sosOffers.map((offer) => (
                    <div key={offer.offer_id} className="rounded-[1.4rem] border border-border/60 bg-card/70 p-4">
                      <div className="flex items-start gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-500/10">
                          <Bell className="h-4 w-4 text-red-500" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[13.5px] font-semibold">
                              {offer.emergency_type.replace(/_/g, " ")} nearby
                            </p>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${offerStatusClass[offer.status]}`}>
                              {offerStatusLabel[offer.status]}
                            </span>
                          </div>
                          <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" /> {offer.area} · {formatOfferDistance(offer.distance_m)}
                          </p>
                        </div>
                      </div>

                      {offer.status === "offered" && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={offerSaving === offer.offer_id}
                            onClick={() => void updateOffer(offer.offer_id, "declined")}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/70 px-3 py-2 text-[11.5px] font-semibold text-muted-foreground transition hover:bg-accent disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" /> Decline
                          </button>
                          <button
                            type="button"
                            disabled={offerSaving === offer.offer_id}
                            onClick={() => void updateOffer(offer.offer_id, "accepted")}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[11.5px] font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                          >
                            {offerSaving === offer.offer_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Accept
                          </button>
                        </div>
                      )}
                      {offer.status === "accepted" && (
                        <button
                          type="button"
                          disabled={offerSaving === offer.offer_id}
                          onClick={() => void updateOffer(offer.offer_id, "en_route")}
                          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-[11.5px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                        >
                          {offerSaving === offer.offer_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
                          Mark en route
                        </button>
                      )}
                      {offer.status === "en_route" && (
                        <button
                          type="button"
                          disabled={offerSaving === offer.offer_id}
                          onClick={() => void updateOffer(offer.offer_id, "arrived")}
                          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-green-600 px-3 py-2 text-[11.5px] font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
                        >
                          {offerSaving === offer.offer_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Mark arrived
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Preferences */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Preferences</p>
              <div className="overflow-hidden rounded-[1.4rem] border border-border/60 bg-card/70">
                <div className="flex items-center gap-4 border-b border-border/50 px-5 py-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/10">
                    <Users className="h-4 w-4 text-amber-500" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold">Help neighbors nearby</span>
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground">
                      Share your availability during SOS alerts. Your exact location is never shown.
                    </span>
                  </div>
                  {responderSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Switch
                      checked={responderAvailable}
                      onCheckedChange={setResponderMode}
                      aria-label="Allow nearby SOS responder alerts"
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex w-full items-center gap-4 border-b border-border/50 px-5 py-4 text-left transition-colors hover:bg-accent"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-card">
                    {theme === "dark" ? <Sun className="h-4 w-4 text-gold" /> : <Moon className="h-4 w-4 text-primary" />}
                  </span>
                  <div className="flex-1">
                    <span className="block text-[13.5px] font-semibold">{theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}</span>
                    <span className="block text-[11.5px] text-muted-foreground">Currently: {theme === "dark" ? "Dark" : "Light"}</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    navigate({ to: "/", replace: true });
                  }}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left text-destructive transition-colors hover:bg-destructive/5"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-destructive/10">
                    <LogOut className="h-4 w-4 text-destructive" />
                  </span>
                  <div className="flex-1">
                    <span className="block text-[13.5px] font-semibold">Sign out</span>
                    <span className="block text-[11.5px] text-destructive/70">You will be returned to the homepage</span>
                  </div>
                </button>
              </div>
            </div>

            <p className="text-[10px] leading-relaxed text-muted-foreground/55">{DISCLAIMER}</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
