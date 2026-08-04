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

  return (
    <CommandShell officer={officer ?? null}>
      <Outlet />
    </CommandShell>
  );
}
