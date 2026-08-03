import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { CommandShell } from "@/components/police/command-shell";
import { OnboardingWizard } from "@/components/police/onboarding-wizard";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { myOfficerQuery } from "@/lib/police";

export const Route = createFileRoute("/_authenticated/police")({
  head: () => ({
    meta: [
      { title: "Police Command Center — Allma Safety AI" },
      {
        name: "description",
        content:
          "Restricted Uganda Police command center for receiving reports, verifying incidents, dispatching officers and managing cases in real time.",
      },
      { property: "og:title", content: "Police Command Center — Allma Safety AI" },
      {
        property: "og:description",
        content: "AI-powered police operating system for incident intake, dispatch and case management.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PoliceLayout,
});

function PoliceLayout() {
  const { user } = useAuth();
  const { data: officer, isLoading } = useQuery(myOfficerQuery);

  if (isLoading || !user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!officer || !officer.onboarding_completed) {
    return <OnboardingWizard userId={user.id} email={user.email ?? ""} />;
  }

  if (officer.status !== "verified") {
    return (
      <div className="signal-streak grid min-h-screen place-items-center px-4">
        <div className="premium-surface w-full max-w-md rounded-3xl border border-border/60 p-7 text-center shadow-lift">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-gold/40 bg-gold/12">
            {officer.status === "pending" ? (
              <ShieldCheck className="h-5 w-5 text-gold" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-primary" />
            )}
          </div>
          <h1 className="font-display text-lg font-semibold">
            {officer.status === "pending" ? "Awaiting command verification" : "Access restricted"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {officer.status === "pending"
              ? `Badge ${officer.badge_number} has been submitted. A commanding officer must verify your credentials before command access is granted.`
              : "Your command access has been suspended or rejected. Contact your commanding officer."}
          </p>
          <Button variant="outline" className="mt-5 rounded-full" asChild>
            <Link to="/chat">Back to the citizen app</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <CommandShell officer={officer}>
      <Outlet />
    </CommandShell>
  );
}
