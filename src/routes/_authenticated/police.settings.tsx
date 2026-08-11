import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, Bell, Shield, Globe, Hash, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { stationsQuery, RANKS } from "@/lib/police";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/police/settings")({
  component: SettingsPage,
});

const TABS = [
  { id: "stations",      label: "Stations",       icon: Building2 },
  { id: "ranks",         label: "Ranks & Roles",  icon: Shield },
  { id: "emergency",     label: "Emergency Nos.", icon: Hash },
  { id: "notifications", label: "Notifications",  icon: Bell },
  { id: "system",        label: "System",         icon: Globe },
] as const;

type Tab = (typeof TABS)[number]["id"];

const NOTIFICATION_OPTIONS = [
  { id: "desktop",  label: "Desktop Notifications", description: "Pop-up alerts in your browser" },
  { id: "email",    label: "Email Alerts",           description: "Critical incidents via email" },
  { id: "sms",      label: "SMS Notifications",      description: "Text alerts to registered phone" },
  { id: "push",     label: "Push Notifications",     description: "Mobile push notifications" },
  { id: "critical", label: "Critical Alerts Only",   description: "Only SOS and critical priority" },
  { id: "all",      label: "All Reports",            description: "Every new report triggers alert" },
];

function SettingsPage() {
  const [tab, setTab] = useState<Tab>("stations");
  const [notifEnabled, setNotifEnabled] = useState<Record<string, boolean>>({
    desktop: true, critical: true,
  });
  const [newStation, setNewStation] = useState({ name: "", district: "", region: "", phone: "" });
  const [saving, setSaving] = useState(false);

  const { data: stations = [], refetch } = useQuery(stationsQuery);

  async function handleAddStation(e: React.FormEvent) {
    e.preventDefault();
    if (!newStation.name || !newStation.district || !newStation.region) {
      toast.error("Name, district and region are required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("police_stations").insert({
      name: newStation.name,
      district: newStation.district,
      region: newStation.region,
      phone: newStation.phone || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Station added");
    setNewStation({ name: "", district: "", region: "", phone: "" });
    refetch();
  }

  return (
    <div className="w-full space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">System configuration, stations, and preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-2xl border border-border/50 bg-secondary/30 p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-medium transition",
              tab === t.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Stations */}
      {tab === "stations" && (
        <div className="space-y-4">
          {/* Add station */}
          <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft">
            <h2 className="mb-4 font-display text-sm font-semibold">Add Police Station</h2>
            <form onSubmit={handleAddStation} className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-muted-foreground">Station Name *</label>
                <Input value={newStation.name} onChange={(e) => setNewStation((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Katwe Police Station" className="rounded-2xl" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-muted-foreground">District *</label>
                <Input value={newStation.district} onChange={(e) => setNewStation((p) => ({ ...p, district: e.target.value }))} placeholder="e.g. Kampala" className="rounded-2xl" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-muted-foreground">Region *</label>
                <Input value={newStation.region} onChange={(e) => setNewStation((p) => ({ ...p, region: e.target.value }))} placeholder="e.g. Central" className="rounded-2xl" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-muted-foreground">Phone</label>
                <Input value={newStation.phone} onChange={(e) => setNewStation((p) => ({ ...p, phone: e.target.value }))} placeholder="+256…" className="rounded-2xl" />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={saving} className="rounded-full">
                  {saving ? "Adding…" : "Add Station"}
                </Button>
              </div>
            </form>
          </section>

          {/* Stations list */}
          <section className="premium-surface rounded-3xl border border-border/55 shadow-soft">
            <div className="border-b border-border/40 px-5 py-3.5">
              <p className="text-sm font-medium">{stations.length} Registered Stations</p>
            </div>
            <div className="divide-y divide-border/40">
              {stations.map((s) => (
                <div key={s.id} className="flex items-start gap-3 px-5 py-3.5">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{s.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {s.district} · {s.region}{s.phone ? ` · ${s.phone}` : ""}
                    </p>
                  </div>
                </div>
              ))}
              {stations.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">No stations registered yet.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Ranks */}
      {tab === "ranks" && (
        <section className="premium-surface rounded-3xl border border-border/55 shadow-soft">
          <div className="border-b border-border/40 px-5 py-3.5 flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Ranks are defined by the system and reflect Uganda Police Force hierarchy.</p>
          </div>
          <div className="divide-y divide-border/40">
            {RANKS.map((rank) => (
              <div key={rank.value} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{rank.label}</p>
                  <p className="text-[11px] text-muted-foreground">{rank.group}</p>
                </div>
                <span className="shrink-0 rounded-full border border-border/50 bg-secondary/40 px-2.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                  {rank.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Emergency Numbers */}
      {tab === "emergency" && (
        <section className="premium-surface rounded-3xl border border-border/55 shadow-soft">
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-gold/30 bg-gold/10">
              <Hash className="h-5 w-5 text-gold" />
            </div>
            <p className="mt-4 font-display text-sm font-semibold">No verified emergency numbers configured</p>
            <p className="mt-1.5 max-w-md text-[12px] leading-relaxed text-muted-foreground">
              Add numbers only after an authorized administrator verifies the service, coverage and source. Ordinary users cannot modify this directory.
            </p>
            <span className="mt-4 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gold">Official integration not configured</span>
          </div>
        </section>
      )}

      {/* Notifications */}
      {tab === "notifications" && (
        <section className="premium-surface rounded-3xl border border-border/55 shadow-soft">
          <div className="divide-y divide-border/40">
            {NOTIFICATION_OPTIONS.map((opt) => (
              <div key={opt.id} className="flex items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{opt.label}</p>
                  <p className="text-[11px] text-muted-foreground">{opt.description}</p>
                </div>
                <button
                  onClick={() => setNotifEnabled((p) => ({ ...p, [opt.id]: !p[opt.id] }))}
                  className={cn(
                    "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
                    notifEnabled[opt.id] ? "border-primary/60 bg-primary" : "border-border/60 bg-secondary/60",
                  )}
                >
                  <span className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                    notifEnabled[opt.id] ? "translate-x-4" : "translate-x-0",
                  )} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* System */}
      {tab === "system" && (
        <div className="space-y-4">
          <section className="premium-surface rounded-3xl border border-border/55 p-5 shadow-soft space-y-4">
            <h2 className="font-display text-sm font-semibold">System Information</h2>
            {[
              { label: "Platform",     value: "Allma Safety AI Command Center" },
              { label: "Version",      value: "1.0.0" },
              { label: "Database",     value: "Supabase (PostgreSQL)" },
              { label: "Auth",         value: "Supabase Auth" },
              { label: "Real-time",    value: "Supabase Realtime" },
              { label: "AI Provider",  value: "OpenAI (GPT-4o)" },
              { label: "Maps",         value: "OpenStreetMap / Leaflet" },
              { label: "Jurisdiction", value: "Uganda" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between border-b border-border/30 pb-3 last:border-0 last:pb-0">
                <span className="text-sm text-muted-foreground">{row.label}</span>
                <span className="text-sm font-medium">{row.value}</span>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
