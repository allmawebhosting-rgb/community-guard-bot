import { AppShell } from "@/components/allma/app-shell";
import { AllmaChat } from "@/components/allma/allma-chat";

export function LandingPage() {
  return (
    <AppShell title="Allma Safety AI">
      <AllmaChat key="landing-guest" threadId={null} fixedComposer />
    </AppShell>
  );
}
