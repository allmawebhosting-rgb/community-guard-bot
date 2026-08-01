import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  FileText,
  Loader2,
  MapPin,
  MessageSquarePlus,
  Megaphone,
  Phone,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/allma/app-header";
import { SosButton } from "@/components/allma/sos-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { createThread, threadsQueryOptions } from "@/lib/threads";
import { DISCLAIMER, EMERGENCY_NUMBERS, REPORT_TYPE_LABELS } from "@/lib/allma";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your dashboard — Allma Safety AI" },
      {
        name: "description",
        content:
          "Track your incident reports, emergency history, community alerts and saved emergency contacts in one place.",
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
  medium: "bg-accent text-accent-foreground",
  high: "bg-alert/20 text-alert-foreground",
  critical: "bg-destructive text-destructive-foreground",
};

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const reports = useQuery({
    queryKey: ["my-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select(
          "id, reference, report_type, category, title, summary, status, risk_level, created_at, location_text",
        )
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

  const emergencies = (reports.data ?? []).filter((report) => report.report_type === "emergency");

  return (
    <AppShell showThreads={false}>
      <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-4 pb-28 pt-6">

        <div className="hero-glow mb-6 rounded-3xl p-6">
          <h1 className="text-2xl font-semibold sm:text-3xl">Your safety dashboard</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Everything you have reported through Allma, plus live community alerts and the numbers
            you may need.
          </p>
          <Button
            className="mt-4 rounded-full"
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
            <MessageSquarePlus className="mr-2 h-4 w-4" /> Start a conversation
          </Button>
        </div>

        <Tabs defaultValue="reports">
          <TabsList className="mb-5 flex w-full flex-wrap justify-start gap-1 rounded-2xl">
            <TabsTrigger value="reports" className="rounded-xl">
              <FileText className="mr-1.5 h-4 w-4" /> My reports
            </TabsTrigger>
            <TabsTrigger value="emergency" className="rounded-xl">
              <ShieldAlert className="mr-1.5 h-4 w-4" /> Emergencies
            </TabsTrigger>
            <TabsTrigger value="alerts" className="rounded-xl">
              <Megaphone className="mr-1.5 h-4 w-4" /> Alerts
            </TabsTrigger>
            <TabsTrigger value="conversations" className="rounded-xl">
              <Bell className="mr-1.5 h-4 w-4" /> Conversations
            </TabsTrigger>
            <TabsTrigger value="contacts" className="rounded-xl">
              <Phone className="mr-1.5 h-4 w-4" /> Contacts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="space-y-3">
            {reports.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (reports.data ?? []).length === 0 ? (
              <EmptyState message="No reports yet. Start a conversation and tell Allma what happened." />
            ) : (
              reports.data!.map((report) => (
                <article
                  key={report.id}
                  className="rounded-3xl border border-border bg-card p-4 shadow-soft"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="rounded-full">
                      {REPORT_TYPE_LABELS[report.report_type] ?? report.report_type}
                    </Badge>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase ${riskTone[report.risk_level] ?? riskTone.low}`}
                    >
                      {report.risk_level}
                    </span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {report.reference}
                    </span>
                  </div>
                  <h2 className="mt-2 text-base font-semibold">{report.title}</h2>
                  {report.summary ? (
                    <p className="mt-1 text-sm text-muted-foreground">{report.summary}</p>
                  ) : null}
                  <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>Status: {report.status}</span>
                    {report.location_text ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {report.location_text}
                      </span>
                    ) : null}
                    <span>{new Date(report.created_at).toLocaleString()}</span>
                  </p>
                </article>
              ))
            )}
          </TabsContent>

          <TabsContent value="emergency" className="space-y-3">
            {emergencies.length === 0 ? (
              <EmptyState message="No emergency activations recorded." />
            ) : (
              emergencies.map((report) => (
                <article
                  key={report.id}
                  className="rounded-3xl border border-destructive/30 bg-destructive/5 p-4"
                >
                  <p className="font-semibold">{report.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {report.reference} · {new Date(report.created_at).toLocaleString()} ·{" "}
                    {report.location_text ?? "no location"}
                  </p>
                </article>
              ))
            )}
          </TabsContent>

          <TabsContent value="alerts" className="space-y-3">
            {alerts.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (alerts.data ?? []).length === 0 ? (
              <EmptyState message="No active community alerts." />
            ) : (
              alerts.data!.map((alert) => (
                <article
                  key={alert.id}
                  className="rounded-3xl border border-border bg-card p-4 shadow-soft"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="rounded-full capitalize">
                      {alert.alert_type}
                    </Badge>
                    <span className="text-xs uppercase text-muted-foreground">
                      {alert.severity}
                    </span>
                  </div>
                  <h2 className="mt-2 font-semibold">{alert.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{alert.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {alert.area ?? "All areas"} · {new Date(alert.starts_at).toLocaleDateString()}
                  </p>
                </article>
              ))
            )}
          </TabsContent>

          <TabsContent value="conversations" className="space-y-2">
            {(threads.data ?? []).length === 0 ? (
              <EmptyState message="No saved conversations yet." />
            ) : (
              threads.data!.map((thread) => (
                <Link
                  key={thread.id}
                  to="/chat/$threadId"
                  params={{ threadId: thread.id }}
                  className="block rounded-2xl border border-border bg-card px-4 py-3 text-sm shadow-soft transition-colors hover:bg-accent"
                >
                  <span className="block truncate font-medium">{thread.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(thread.updated_at).toLocaleString()}
                  </span>
                </Link>
              ))
            )}
          </TabsContent>

          <TabsContent value="contacts" className="space-y-2">
            {EMERGENCY_NUMBERS.map((entry) => (
              <a
                key={`${entry.label}-${entry.number}`}
                href={`tel:${entry.number}`}
                className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-soft transition-colors hover:bg-accent"
              >
                <span>
                  <span className="block font-semibold">{entry.label}</span>
                  <span className="block text-xs text-muted-foreground">{entry.description}</span>
                </span>
                <span className="rounded-full bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground">
                  {entry.number}
                </span>
              </a>
            ))}
          </TabsContent>
        </Tabs>

        <p className="mt-8 text-[11px] leading-relaxed text-muted-foreground">{DISCLAIMER}</p>
      </main>
      <SosButton />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
