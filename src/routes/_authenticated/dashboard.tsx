import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell, FileText, Loader2, MapPin, MessageSquarePlus, Megaphone, Phone,
  ShieldAlert, TrendingUp, AlertTriangle, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/allma/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { createThread, threadsQueryOptions } from "@/lib/threads";
import { useRequireOnboarding } from "@/lib/onboarding";
import { DISCLAIMER, EMERGENCY_NUMBERS, REPORT_TYPE_LABELS } from "@/lib/allma";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your dashboard — Allma Safety AI" },
      {
        name: "description",
        content:
          "Track your incident reports, emergency history, nearby resources and saved emergency contacts in one place.",
      },
      { property: "og:title", content: "Your dashboard — Allma Safety AI" },
      {
        property: "og:description",
        content: "Reports, emergency history, alerts and contacts from Allma Safety AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const riskTone: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-gold/10 text-gold",
  high: "bg-primary/10 text-primary",
  critical: "bg-destructive/10 text-destructive",
};

function Dashboard() {
  const navigate = useNavigate();
  useRequireOnboarding();
  const queryClient = useQueryClient();

  const reports = useQuery({
    queryKey: ["my-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, reference, report_type, category, title, summary, status, risk_level, created_at, location_text")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const alerts = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_alerts")
        .select("id, title, body, alert_type, severity, area, starts_at")
        .eq("is_published", true)
        .order("starts_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data;
    },
  });

  const threads = useQuery(threadsQueryOptions());
  const emergencies = (reports.data ?? []).filter((r) => r.report_type === "emergency");

  const stats = [
    { label: "Total reports", value: reports.data?.length ?? 0, icon: FileText, color: "text-primary", bg: "bg-primary/10" },
    { label: "Emergencies", value: emergencies.length, icon: ShieldAlert, color: "text-destructive", bg: "bg-destructive/10" },
    { label: "Active alerts", value: alerts.data?.length ?? 0, icon: Megaphone, color: "text-gold", bg: "bg-gold/10" },
    { label: "Conversations", value: threads.data?.length ?? 0, icon: Bell, color: "text-success", bg: "bg-success/10" },
  ];

  return (
    <AppShell title="Dashboard">
      <div className="mx-auto w-full max-w-6xl px-5 pb-6 pt-6 lg:px-10 lg:pt-8">

        {/* Hero bar */}
        <div className="relative mb-8 overflow-hidden rounded-[2rem] border border-border/50 bg-card/50 p-6 lg:p-8">
          <div className="hero-glow absolute inset-0 pointer-events-none" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-black tracking-[-0.03em] lg:text-3xl">
                Safety Dashboard
              </h1>
              <p className="mt-1.5 max-w-xl text-[13px] text-muted-foreground lg:text-[14px]">
                Everything you have reported through Allma, plus nearby resources and the numbers you may need.
              </p>
            </div>
            <Button
              className="rounded-full shadow-soft"
              onClick={async () => {
                try {
                  const thread = await createThread();
                  await queryClient.invalidateQueries({ queryKey: ["threads"] });
                  navigate({ to: "/chat/$threadId", params: { threadId: thread.id } });
                } catch {
                  toast.error("Could not start a new conversation.");
                }
              }}
            >
              <MessageSquarePlus className="mr-2 h-4 w-4" /> New conversation
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="rounded-2xl border border-border/50 bg-card/70 p-5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">{stat.label}</p>
                  <span className={cn("grid h-8 w-8 place-items-center rounded-xl", stat.bg)}>
                    <Icon className={cn("h-4 w-4", stat.color)} />
                  </span>
                </div>
                <p className={cn("mt-2 font-display text-3xl font-black tabular-nums", stat.color)}>{stat.value}</p>
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="reports">
          <TabsList className="mb-5 flex w-full flex-wrap justify-start gap-1 rounded-2xl border border-border/50 bg-card/50 p-1">
            <TabsTrigger value="reports" className="rounded-xl gap-1.5">
              <FileText className="h-3.5 w-3.5" /> My reports
            </TabsTrigger>
            <TabsTrigger value="emergency" className="rounded-xl gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" /> Emergencies
            </TabsTrigger>
            <TabsTrigger value="alerts" className="rounded-xl gap-1.5">
              <Megaphone className="h-3.5 w-3.5" /> Alerts
            </TabsTrigger>
            <TabsTrigger value="conversations" className="rounded-xl gap-1.5">
              <Bell className="h-3.5 w-3.5" /> Conversations
            </TabsTrigger>
            <TabsTrigger value="contacts" className="rounded-xl gap-1.5">
              <Phone className="h-3.5 w-3.5" /> Contacts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reports">
            {reports.isLoading ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-32 animate-pulse rounded-[1.4rem] border border-border/50 bg-card/50" />
                ))}
              </div>
            ) : (reports.data ?? []).length === 0 ? (
              <EmptyState icon={FileText} message="No reports yet. Start a conversation and tell Allma what happened." />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {reports.data!.map((report) => (
                  <article key={report.id} className="rounded-[1.4rem] border border-border/60 bg-card/80 p-5 shadow-soft backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-lift">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="rounded-full text-[10.5px]">
                        {REPORT_TYPE_LABELS[report.report_type] ?? report.report_type}
                      </Badge>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${riskTone[report.risk_level] ?? riskTone.low}`}>
                        {report.risk_level}
                      </span>
                      <span className="ml-auto font-mono text-[10.5px] font-bold text-gold">{report.reference}</span>
                    </div>
                    <h2 className="mt-2.5 text-[14.5px] font-bold leading-snug">{report.title}</h2>
                    {report.summary && (
                      <p className="mt-1.5 text-[12.5px] text-muted-foreground line-clamp-2">{report.summary}</p>
                    )}
                    <p className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground/70">
                      <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> {report.status}</span>
                      {report.location_text && (
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {report.location_text}</span>
                      )}
                      <span className="ml-auto flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {new Date(report.created_at).toLocaleDateString("en-UG", { day: "numeric", month: "short" })}
                      </span>
                    </p>
                  </article>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="emergency">
            {emergencies.length === 0 ? (
              <EmptyState icon={ShieldAlert} message="No emergency activations recorded." />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {emergencies.map((report) => (
                  <article key={report.id} className="rounded-[1.4rem] border border-destructive/30 bg-destructive/5 p-5">
                    <p className="font-semibold">{report.title}</p>
                    <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                      {report.reference} · {new Date(report.created_at).toLocaleString()} · {report.location_text ?? "no location"}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="alerts">
            {alerts.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (alerts.data ?? []).length === 0 ? (
              <EmptyState icon={Megaphone} message="No active nearby resources or alerts." />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {alerts.data!.map((alert) => (
                  <article key={alert.id} className="rounded-[1.4rem] border border-border/60 bg-card/80 p-5 shadow-soft">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="rounded-full capitalize text-[10.5px]">{alert.alert_type}</Badge>
                      <span className="text-[10.5px] uppercase text-muted-foreground">{alert.severity}</span>
                    </div>
                    <h2 className="mt-2.5 font-bold text-[14px]">{alert.title}</h2>
                    <p className="mt-1.5 text-[12.5px] text-muted-foreground line-clamp-2">{alert.body}</p>
                    <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground/70">
                      <MapPin className="h-3 w-3" /> {alert.area ?? "All areas"} · {new Date(alert.starts_at).toLocaleDateString()}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="conversations">
            {(threads.data ?? []).length === 0 ? (
              <EmptyState icon={Bell} message="No saved conversations yet." />
            ) : (
              <div className="grid gap-2.5 lg:grid-cols-2">
                {threads.data!.map((thread) => (
                  <Link
                    key={thread.id}
                    to="/chat/$threadId"
                    params={{ threadId: thread.id }}
                    className="group rounded-2xl border border-border/60 bg-card/80 px-5 py-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lift"
                  >
                    <span className="block truncate text-[14px] font-semibold group-hover:text-primary">{thread.title}</span>
                    <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                      <Clock className="h-3 w-3" /> {new Date(thread.updated_at).toLocaleString()}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="contacts">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {EMERGENCY_NUMBERS.map((entry) => (
                <a
                  key={`${entry.label}-${entry.number}`}
                  href={`tel:${entry.number}`}
                  className="group flex items-center gap-4 rounded-2xl border border-border/60 bg-card/80 p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lift"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 transition-transform group-hover:scale-105">
                    <Phone className="h-5 w-5 text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold">{entry.label}</span>
                    <span className="block text-[11.5px] text-muted-foreground">{entry.description}</span>
                  </div>
                  <span className="shrink-0 rounded-full bg-gradient-to-br from-primary to-primary-glow px-3 py-1.5 font-display text-[14px] font-black text-primary-foreground">
                    {entry.number}
                  </span>
                </a>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <p className="mt-8 text-[11px] leading-relaxed text-muted-foreground/60">{DISCLAIMER}</p>
      </div>
    </AppShell>
  );
}

function EmptyState({ icon: Icon, message }: { icon: typeof FileText; message: string }) {
  return (
    <div className="rounded-[2rem] border border-dashed border-border/60 p-12 text-center">
      <Icon className="mx-auto h-9 w-9 text-muted-foreground/25" />
      <p className="mt-4 text-[13px] text-muted-foreground">{message}</p>
    </div>
  );
}
