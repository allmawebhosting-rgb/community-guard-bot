import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, MapPin } from "lucide-react";
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
      <div className="px-4 pb-6 pt-5">
        <h1 className="font-display text-xl font-black tracking-[-0.02em]">My reports</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">Every case you filed with Allma, with its reference.</p>

        <div className="mt-5 space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-[1.4rem] border border-border/50 bg-card/50" />
            ))
          ) : !reports || reports.length === 0 ? (
            <div className="rounded-[1.4rem] border border-border/60 bg-card/70 p-8 text-center">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-semibold">No reports yet</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Start a conversation and Allma will build the report with you.
              </p>
              <Link
                to="/chat"
                className="mt-4 inline-flex rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 text-[12.5px] font-semibold text-primary-foreground shadow-soft"
              >
                Report an incident
              </Link>

            </div>
          ) : (
            reports.map((report) => (
              <article
                key={report.id}
                className="rounded-[1.4rem] border border-border/60 bg-card/80 p-4 shadow-soft backdrop-blur-sm"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]",
                      RISK[report.risk_level] ?? RISK.low,
                    )}
                  >
                    {report.risk_level}
                  </span>
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {REPORT_TYPE_LABELS[report.report_type] ?? report.report_type}
                  </span>
                  <span className="ml-auto font-mono text-[10.5px] text-gold">{report.reference}</span>
                </div>
                <h2 className="mt-2.5 text-[15px] font-bold leading-snug">{report.title}</h2>
                {report.summary && (
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{report.summary}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground/80">
                  <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold capitalize">{report.status}</span>
                  {report.location_text && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" /> {report.location_text}
                    </span>
                  )}
                  <span>{new Date(report.created_at).toLocaleDateString()}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
