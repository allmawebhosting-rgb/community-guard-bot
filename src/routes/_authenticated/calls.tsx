import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/allma/app-shell";
import { CallHistory } from "@/components/allma/calls/call-history";
import { BackgroundCallPrompt } from "@/components/allma/calls/background-call-prompt";

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
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
        <BackgroundCallPrompt />
        <div className="mb-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/65">
            Voice history
          </p>
          <h1 className="mt-1 font-display text-2xl font-black">Allma calls</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Calls are authorized through your Safety Network and carried by ZEGOCLOUD RTC.
          </p>
        </div>
        <CallHistory />
      </div>
    </AppShell>
  );
}
