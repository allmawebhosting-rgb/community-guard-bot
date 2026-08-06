import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";
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
          "Restricted police integration command center for receiving reports, verifying incidents, dispatching officers and managing cases in real time.",
      },
      { property: "og:title", content: "Police Command Center — Allma Safety AI" },
      {
        property: "og:description",
        content: "AI-powered police integration workspace for incident intake, dispatch and case management.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PoliceLayout,
});

function PoliceLayout() {
  const { user, loading: authLoading } = useAuth();
  const {
    data: officer,
    isLoading: officerLoading,
    isError: officerHasError,
    error: officerError,
    refetch: refetchOfficer,
  } = useQuery({
    ...myOfficerQuery,
    enabled: Boolean(user?.id),
  });

  if (authLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
          <p className="text-sm font-medium">Loading command center</p>
          <p className="text-xs text-muted-foreground">Verifying your officer access…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6">
        <div className="max-w-sm text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-primary" />
          <h1 className="mt-4 font-display text-xl font-semibold">Sign-in required</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Sign in with your officer account to open the command center.
          </p>
          <Button asChild className="mt-5 rounded-full">
            <Link to="/auth">Go to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <CommandShell officer={officer ?? null}>
      {officerLoading ? (
        <div className="grid min-h-[calc(100vh-7rem)] place-items-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
            <p className="text-sm font-medium">Loading command center</p>
            <p className="text-xs text-muted-foreground">Verifying your officer access…</p>
          </div>
        </div>
      ) : officerHasError ? (
        <div className="grid min-h-[calc(100vh-7rem)] place-items-center px-6">
          <div className="max-w-md text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-destructive" />
            <h1 className="mt-4 font-display text-xl font-semibold">Command center couldn’t load</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              We couldn’t verify your officer profile. Check your connection and try again.
            </p>
            {officerError instanceof Error && (
              <p className="mt-2 break-words text-[11px] text-muted-foreground/70">{officerError.message}</p>
            )}
            <Button
              className="mt-5 rounded-full"
              onClick={() => void refetchOfficer()}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
          </div>
        </div>
      ) : !officer ? (
        <OnboardingWizard userId={user.id} email={user.email ?? ""} />
      ) : (
        <Outlet />
      )}
    </CommandShell>
  );
}
