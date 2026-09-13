import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/allma/app-shell";
import { SafetyNetworkPanel } from "@/components/allma/safety-network/safety-network-panel";

export const Route = createFileRoute("/_authenticated/safety-network")({
  head: () => ({
    meta: [
      { title: "Safety Network — Allma Safety AI" },
      { name: "description", content: "Manage trusted responders, emergency permissions and Safety Network readiness." },
      { property: "og:title", content: "Safety Network — Allma Safety AI" },
      { property: "og:description", content: "Manage the people who may support you during an emergency." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SafetyNetworkScreen,
});

function SafetyNetworkScreen() {
  return (
    <AppShell>
      <main className="safety-workspace min-h-full">
        <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-5 sm:px-6 lg:px-10 lg:pt-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Link to="/profile" className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Back to profile
              </Link>
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-trusted text-trusted-foreground shadow-soft">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-trusted">Your trusted response team</p>
                  <h1 className="font-display text-2xl font-bold sm:text-3xl">Safety Network</h1>
                </div>
              </div>
            </div>
          </div>
          <SafetyNetworkPanel workspace />
        </div>
      </main>
    </AppShell>
  );
}
