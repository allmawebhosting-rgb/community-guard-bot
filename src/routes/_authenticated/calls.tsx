import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/allma/app-shell";
import { EmergencyCallsWorkspace } from "@/components/allma/emergency-calls";

export const Route = createFileRoute("/_authenticated/calls")({
  head: () => ({
    meta: [
      { title: "Emergency calls — Allma Safety AI" },
      {
        name: "description",
        content: "Consent-based in-app emergency communication and responder coordination.",
      },
    ],
  }),
  component: CallsRoute,
});

function CallsRoute() {
  return (
    <AppShell title="Emergency calls">
      <EmergencyCallsWorkspace />
    </AppShell>
  );
}
