import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  ExternalLink,
  Landmark,
  LockKeyhole,
  MapPin,
  Radio,
  ShieldAlert,
  Siren,
  UserRoundCheck,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { incidentsQuery, logAudit, myOfficerQuery, stationsQuery, statusLabel, timeAgo, type Incident } from "@/lib/police";
import {
  authorityDirectoryQuery,
  authorityLabel,
  authorityNotificationsQuery,
  demoAuthorities,
  recommendAuthority,
  notificationStatusLabel,
  type AuthorityType,
  type NotificationStatus,
} from "@/lib/authority";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/police/authority")({
  component: AuthorityPage,
});

const DEMO_CASES: Incident[] = [
  {
    id: "demo-critical-attack",
    reference: "DEMO-ASA-000128",
    title: "Active attack reported",
    category: "crime",
    priority: "critical",
    status: "submitted",
    location_text: "Jinja",
    district: "Jinja",
    narrative: "Citizen reported a possible active assault. This is a simulated case for demonstration.",
    summary: "Possible active assault",
    ai_summary: "AI inferred possible active assault from the citizen statement. Human review required.",
    ai_suggested_category: "crime",
    ai_recommended_actions: ["Police escalation recommended", "Keep citizen safe"],
    risk_level: "critical",
    latitude: 0.4479,
    longitude: 33.2026,
    created_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    occurred_at: null,
    resolved_at: null,
    is_anonymous: true,
    is_possible_duplicate: false,
    contact_name: null,
    contact_phone: null,
    details: {},
    assigned_officer_id: null,
    station_id: null,
    thread_id: null,
    user_id: null,
    verified_at: null,
    report_type: "sos",
  },
  {
    id: "demo-medical-collapse",
    reference: "DEMO-ASA-000129",
    title: "Person collapsed",
    category: "medical",
    priority: "high",
    status: "under_review",
    location_text: "Jinja",
    district: "Jinja",
    narrative: "Someone has collapsed. No official medical integration is configured.",
    summary: "Unconscious adult reported",
    ai_summary: "AI inferred a possible critical medical emergency. Do not present this inference as confirmed.",
    ai_suggested_category: "medical",
    ai_recommended_actions: ["Medical assistance recommended"],
    risk_level: "high",
    latitude: null,
    longitude: null,
    created_at: new Date(Date.now() - 11 * 60_000).toISOString(),
    updated_at: new Date(Date.now() - 11 * 60_000).toISOString(),
    occurred_at: null,
    resolved_at: null,
    is_anonymous: false,
    is_possible_duplicate: false,
    contact_name: null,
    contact_phone: null,
    details: {},
    assigned_officer_id: null,
    station_id: null,
    thread_id: null,
    user_id: null,
    verified_at: null,
    report_type: "incident",
  },
];

const LIFECYCLE: NotificationStatus[] = ["preparing", "queued", "sending", "sent", "acknowledged"];

function AuthorityPage() {
  const qc = useQueryClient();
  const { data: officer } = useQuery(myOfficerQuery);
  const { data: incidents = [] } = useQuery(incidentsQuery);
  const { data: stations = [] } = useQuery(stationsQuery);
  const { data: authorities = [] } = useQuery(authorityDirectoryQuery);
  const { data: notifications = [] } = useQuery(authorityNotificationsQuery);
  const [demoMode, setDemoMode] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [demoStatus, setDemoStatus] = useState<NotificationStatus>("preparing");
  const [authorityType, setAuthorityType] = useState<AuthorityType | null>(null);

  const cases = incidents.length > 0 ? incidents : DEMO_CASES;
  const selected = cases.find((item) => item.id === selectedId) ?? cases[0];
  const recommendedType = authorityType ?? recommendAuthority(selected?.category ?? null, selected?.priority ?? "medium");
  const configuredAuthorities = authorities.filter((item) => item.authority_type === recommendedType);
  const demoAuthority = demoAuthorities().find((item) => item.authority_type === recommendedType) ?? demoAuthorities()[0];
  const matchedAuthority = configuredAuthorities[0] ?? demoAuthority;
  const isCritical = selected?.priority === "critical";

  const prepareCase = useMutation({
    mutationFn: async () => {
      if (!selected || !officer) throw new Error("Select a case and verify officer access first");
      if (demoMode) {
        setDemoStatus("queued");
        await logAudit("demo_authority_case_prepared", "reports", selected.id, {
          authority_type: recommendedType,
          demo: true,
        });
        return;
      }
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("authority_notifications" as never).insert({
        report_id: selected.id,
        authority_type: recommendedType,
        method: "manual_operator",
        status: "preparing",
        is_demo: false,
        reason: "Prepared for authorized operator review; no official integration is configured.",
        created_by: auth.user?.id ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(demoMode ? "DEMO case prepared — no authority was contacted" : "Case prepared for operator review");
      qc.invalidateQueries({ queryKey: ["police", "authority-notifications"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const requestEscalation = useMutation({
    mutationFn: async () => {
      if (!selected || !officer) throw new Error("Officer access is required");
      if (demoMode) {
        await logAudit("demo_authority_escalation_requested", "reports", selected.id, {
          from_level: "community_responder",
          to_level: authorityType === "LOCAL_AUTHORITY" ? "local_authority" : "official_service",
          demo: true,
        });
        return;
      }
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("authority_escalations" as never).insert({
        report_id: selected.id,
        from_level: "community_responder",
        to_level: authorityType === "LOCAL_AUTHORITY" ? "local_authority" : "official_service",
        reason: isCritical ? "Critical incident bypasses intermediate responder wait." : "Authorized operator requested escalation.",
        status: "requested",
        is_demo: false,
        created_by: auth.user?.id ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => toast.success(demoMode ? "DEMO escalation requested — no official service contacted" : "Escalation recorded for authorized handling"),
    onError: (error: Error) => toast.error(error.message),
  });

  function advanceDemo() {
    const index = LIFECYCLE.indexOf(demoStatus);
    if (index < LIFECYCLE.length - 1) {
      const next = LIFECYCLE[index + 1];
      setDemoStatus(next);
      toast.success(`DEMO notification state: ${notificationStatusLabel(next)}`);
    } else {
      toast.info("DEMO acknowledgement is simulated; no authority confirmed receipt");
    }
  }

  const liveNotification = notifications.find((item) => item.report_id === selected?.id);
  const status = demoMode ? demoStatus : liveNotification?.status ?? "unknown";
  const statusIndex = LIFECYCLE.indexOf(status);
  const authorityCount = authorities.length + demoAuthorities().length;
  const stationCoverage = stations.filter((station) => station.district === selected?.district).length;

  return (
    <div className="w-full space-y-5 pb-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
            <Landmark className="h-3.5 w-3.5" /> Phase 5 · Authority layer
          </div>
          <h1 className="font-display text-2xl font-black tracking-[-0.04em]">Authority Coordination</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Prepare structured emergency cases for configured authorities without claiming that Allma is an official service.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-gold/30 bg-gold/10 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold">Demo mode</span>
          <button
            type="button"
            aria-label="Toggle demo mode"
            onClick={() => {
              setDemoMode((value) => !value);
              setDemoStatus("preparing");
            }}
            className={cn("relative h-5 w-9 rounded-full border transition", demoMode ? "border-gold/70 bg-gold" : "border-border/60 bg-secondary")}
          >
            <span className={cn("absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform", demoMode ? "translate-x-4" : "translate-x-0.5")} />
          </button>
        </div>
      </header>

      <section className="relative overflow-hidden rounded-[1.75rem] border border-primary/25 bg-[radial-gradient(circle_at_85%_10%,hsl(var(--gold)/.18),transparent_30%),linear-gradient(135deg,hsl(var(--primary)/.15),hsl(var(--card)/.96)_62%)] p-5 shadow-lift lg:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full border border-gold/20" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-primary/30 bg-background/45">
              <ShieldAlert className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">{demoMode ? "DEMO coordination workspace" : "Production boundary active"}</p>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                {demoMode
                  ? "Every authority action below is simulated and labeled DEMO. This is demonstration data. Allma does not notify police, ambulance, fire, or government systems."
                  : "Official integration not configured. Cases can be prepared for an authorized operator, but no notification will be sent automatically."}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label="Queue" value={cases.length} />
            <Metric label="Critical" value={cases.filter((item) => item.priority === "critical").length} tone="critical" />
            <Metric label="Directory" value={authorityCount} />
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-5">
          <section className="card-desktop overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 px-5 py-4">
              <div>
                <h2 className="font-display text-sm font-semibold">Emergency queue</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Critical incidents bypass community responder wait where safety requires it.</p>
              </div>
              <Link to="/police/incidents" className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                All incidents <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-border/30">
              {cases.map((item) => {
                const active = selected?.id === item.id;
                const critical = item.priority === "critical";
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setAuthorityType(null);
                      setDemoStatus("preparing");
                    }}
                    className={cn("flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-secondary/20", active && "bg-primary/[0.06]")}
                  >
                    <div className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl", critical ? "bg-primary/15 text-primary" : "bg-gold/12 text-gold")}>
                      {critical ? <Siren className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[13px] font-semibold">{item.title}</p>
                        {critical && <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">Critical</span>}
                        {String(item.id).startsWith("demo-") && <span className="rounded-full border border-gold/35 bg-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">Demo</span>}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-mono">{item.reference}</span><span>·</span><span>{item.location_text ?? "Location not shared"}</span><span>·</span><span>{timeAgo(item.created_at)}</span>
                      </p>
                    </div>
                    <ChevronRight className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground/40 transition", active && "translate-x-0.5 text-primary")} />
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card-desktop">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-display text-sm font-semibold">Authority directory</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Only administrator-configured contacts can become operational.</p>
              </div>
              <span className="rounded-full border border-border/50 bg-secondary/40 px-2.5 py-1 text-[10px] text-muted-foreground">{authorities.length ? "Configured" : "No live contacts"}</span>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {demoAuthorities().map((authority) => {
                const configured = authorities.some((entry) => entry.authority_type === authority.authority_type);
                const active = recommendedType === authority.authority_type;
                return (
                  <button
                    key={authority.id}
                    type="button"
                    onClick={() => setAuthorityType(authority.authority_type)}
                    className={cn("rounded-2xl border p-3 text-left transition hover:border-border", active ? "border-primary/45 bg-primary/[0.06]" : "border-border/40 bg-secondary/15")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid h-8 w-8 place-items-center rounded-xl bg-secondary/70 text-muted-foreground"><Building2 className="h-4 w-4" /></div>
                      <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider", configured ? "bg-success/12 text-success" : "bg-gold/12 text-gold")}>{configured ? "Ready" : "Demo"}</span>
                    </div>
                    <p className="mt-3 text-xs font-semibold">{configured ? authorityLabel(authority.authority_type) : authority.organization}</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{configured ? "Configured contact available to authorized operators." : "No official contact configured."}</p>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-gold/20 bg-gold/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
              <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
              <span>Emergency numbers, API endpoints, officer details, and exact operational locations remain hidden until verified and authorized.</span>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          {selected && (
            <section className={cn("card-desktop border-primary/25", isCritical && "border-primary/45 shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_18%,transparent)]")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="label-xs">Selected case</p>
                  <h2 className="mt-1 font-display text-base font-bold">{selected.title}</h2>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">{selected.reference}</p>
                </div>
                {isCritical && <Siren className="h-5 w-5 text-primary" />}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
                <Detail label="User reported" value={selected.narrative ?? "Statement unavailable"} wide />
                <Detail label="AI inferred" value={selected.ai_summary ?? "No AI assessment recorded"} wide />
                <Detail label="System confirmed" value={selected.latitude != null ? "GPS location acquired" : "Location not confirmed"} />
                <Detail label="Jurisdiction" value={`${selected.district ?? "Unassigned"} · ${stationCoverage} station profile(s)`} />
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-info/20 bg-info/[0.06] px-3 py-2.5 text-[11px] text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-info" />
                <span>{selected.location_text ?? "Location not shared"} · jurisdiction matching uses configured coverage, not the nearest building.</span>
              </div>
            </section>
          )}

          <section className="card-desktop">
            <div className="flex items-center gap-2">
              <Workflow className="h-4 w-4 text-gold" />
              <h2 className="font-display text-sm font-semibold">Escalation recommendation</h2>
            </div>
            <div className="mt-3 rounded-2xl border border-gold/25 bg-gold/[0.06] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold">Recommended</p>
              <p className="mt-1 text-sm font-semibold">{authorityLabel(recommendedType)}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {isCritical ? "Critical incident: official escalation should be prioritized without waiting for a community responder." : "Recommendation only. An authorized operator must decide whether to request assistance."}
              </p>
            </div>
            <div className="mt-3 flex gap-2">
              <Button className="flex-1 rounded-xl" onClick={() => requestEscalation.mutate()} disabled={requestEscalation.isPending}>
                <ArrowRight className="mr-1.5 h-3.5 w-3.5" /> {demoMode ? "DEMO request" : "Request escalation"}
              </Button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">AI status: <strong className="text-gold">RECOMMENDED</strong> · dispatch status changes only after authorized action.</p>
          </section>

          <section className="card-desktop">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" />
                <h2 className="font-display text-sm font-semibold">Notification workflow</h2>
              </div>
              <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider", demoMode ? "border-gold/30 bg-gold/10 text-gold" : "border-border/50 bg-secondary/40 text-muted-foreground")}>{demoMode ? "DEMO" : "Live boundary"}</span>
            </div>
            <div className="mt-4 space-y-0.5">
              {LIFECYCLE.map((state, index) => {
                const done = statusIndex >= index;
                return (
                  <div key={state} className="flex items-center gap-2.5">
                    <div className={cn("grid h-5 w-5 place-items-center rounded-full border text-[9px]", done ? "border-primary/50 bg-primary/15 text-primary" : "border-border/50 text-muted-foreground/40")}>
                      {done ? <BadgeCheck className="h-3 w-3" /> : index + 1}
                    </div>
                    <span className={cn("text-[11px]", done ? "font-semibold text-foreground" : "text-muted-foreground/50")}>{notificationStatusLabel(state)}</span>
                    {index < LIFECYCLE.length - 1 && <div className={cn("ml-2 h-3 w-px", statusIndex > index ? "bg-primary/50" : "bg-border/40")} />}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 rounded-xl border border-border/40 bg-secondary/20 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current status</p>
              <p className="mt-1 text-sm font-semibold">{demoMode ? `DEMO ${notificationStatusLabel(status)}` : "Official integration not configured"}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                {demoMode ? "Simulation only. No authority has been notified or acknowledged this case." : "Use a controlled manual action only after an authorized contact is verified."}
              </p>
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => prepareCase.mutate()} disabled={prepareCase.isPending}>
                <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" /> Prepare case
              </Button>
              {demoMode && <Button variant="ghost" className="rounded-xl" onClick={advanceDemo} disabled={status === "acknowledged"}>Advance</Button>}
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground"><LockKeyhole className="mt-0.5 h-3 w-3 shrink-0" /> Never say “Police notified” unless a configured integration returns a confirmed success.</p>
          </section>

          <section className="rounded-2xl border border-border/40 bg-secondary/15 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold"><UserRoundCheck className="h-3.5 w-3.5 text-success" /> Role-scoped operator view</div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">Officer assignment, media access, location visibility and official actions must remain server-side permission checks, not just frontend controls.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "critical" }) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/30 px-3 py-2">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 font-display text-lg font-bold tabular-nums", tone === "critical" && "text-primary")}>{value}</p>
    </div>
  );
}

function Detail({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn(wide && "col-span-2")}>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <p className="mt-0.5 leading-relaxed text-foreground/85">{value}</p>
    </div>
  );
}
