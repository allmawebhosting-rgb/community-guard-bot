import { AllmaChat } from "@/components/allma/allma-chat";
import { BrandLockup } from "@/components/allma/brand";
import { Link } from "@tanstack/react-router";

export function LandingPage() {
  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/50 bg-background/85 px-4 backdrop-blur-xl sm:px-6">
        <Link to="/" aria-label="Allma Safety AI home">
          <BrandLockup />
        </Link>
        <Link
          to="/auth"
          className="rounded-full border border-border/60 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-accent"
        >
          Sign in
        </Link>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <AllmaChat key="landing-guest" threadId={null} />
      </main>
    </div>
  );
}
