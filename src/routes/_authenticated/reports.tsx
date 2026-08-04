import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, MapPin, Plus } from "lucide-react";
import { AppShell } from "@/components/allma/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { REPORT_TYPE_LABELS } from "@/lib/allma";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "My reports — Allma Safety AI" },
      {
        name: "description",
        content: "Track every incident you have reported with Allma Safety AI, including reference numbers and status.",
      },
      { property: "og:title", content: "My reports — Allma Safety AI" },
      { property: "og:description", content: "Track your incident reports, references and status in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsScreen,
});

const RISK: Record<string, string> = {
  critical: "border-primary/50 bg-primary/12 text-primary",
  high: "border-primary/40 bg-primary/10 text-primary",
  medium: "border-gold/40 bg-gold/10 text-gold",
  low: "border-success/40 bg-success/10 text-success",
};

const STATUS_COLOR: Record<string, string> = {
  open: "bg-primary/10 text-primary",
  under_review: "bg-gold/10 text-gold",
  resolved: "bg-success/10 text-success",
  closed: "bg-muted text-muted-foreground",
};

function ReportsScreen() {
  const { data: reports, isLoading } = useQuery({
    queryKey: ["my-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, reference, title, summary, report_type, status, risk_level, location_text, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell title="My reports">
      <div className="mx-auto w-full max-w-6xl px-5 pb-6 pt-6 lg:px-10 lg:pt-8">

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/12">
              <FileText className="h-6 w-6 text-primary" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-black tracking-[-0.02em] lg:text-3xl">My Reports</h1>
              <p className="mt-0.5 text-[12px] text-muted-foreground lg:text-[13px]">
                Every case you filed with Allma, with its reference number.
              </p>
            </div>
          </div>
          <Link
            to="/chat"
            className="flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-5 py-2.5 text-[13px] font-bold text-primary-foreground shadow-soft transition-all hover:scale-[1.02] hover:shadow-lift"
          >
            <Plus className="h-4 w-4" /> New report
          </Link>
        </div>

        {isLoading ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-36 animate-pulse rounded-[1.4rem] border border-border/50 bg-card/50" />
            ))}
          </div>
        ) : !reports || reports.length === 0 ? (
          <div className="rounded-[2rem] border border-border/60 bg-card/70 p-16 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <p className="mt-4 font-display text-xl font-bold">No reports yet</p>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Start a conversation and Allma will build the report with you.
            </p>
            <Link
              to="/chat"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 text-[13.5px] font-bold text-primary-foreground shadow-soft transition-all hover:scale-[1.02]"
            >
              <Plus className="h-4 w-4" /> Report an incident
            </Link>
          </div>
        ) : (
          <>
            {/* Summary bar */}
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Total", value: reports.length, color: "text-foreground" },
                { label: "Open", value: reports.filter((r) => r.status === "open").length, color: "text-primary" },
                { label: "Resolved", value: reports.filter((r) => r.status === "resolved").length, color: "text-success" },
                { label: "Critical", value: reports.filter((r) => r.risk_level === "critical").length, color: "text-destructive" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-border/50 bg-card/60 p-4 text-center">
                  <p className={cn("font-display text-2xl font-black tabular-nums", stat.color)}>{stat.value}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {reports.map((report) => (
                <article
                  key={report.id}
                  className="flex flex-col rounded-[1.4rem] border border-border/60 bg-card/80 p-5 shadow-soft backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]",
                      RISK[report.risk_level] ?? RISK.low,
                    )}>
                      {report.risk_level}
                    </span>
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {REPORT_TYPE_LABELS[report.report_type] ?? report.report_type}
                    </span>
                    <span className="ml-auto font-mono text-[11px] font-bold text-gold">{report.reference}</span>
                  </div>

                  <h2 className="mt-3 text-[15px] font-bold leading-snug">{report.title}</h2>
                  {report.summary && (
                    <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-muted-foreground line-clamp-2">{report.summary}</p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2.5 text-[11px]">
                    <span className={cn(
                      "rounded-full px-2.5 py-1 font-semibold capitalize",
                      STATUS_COLOR[report.status] ?? "bg-muted text-muted-foreground",
                    )}>
                      {report.status?.replace(/_/g, " ")}
                    </span>
                    {report.location_text && (
                      <span className="flex items-center gap-1 text-muted-foreground/70">
                        <MapPin className="h-3 w-3" /> {report.location_text}
                      </span>
                    )}
                    <span className="ml-auto text-muted-foreground/60">
                      {new Date(report.created_at).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
