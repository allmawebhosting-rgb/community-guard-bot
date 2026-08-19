import { AllmaChat } from "@/components/allma/allma-chat";
import { BrandLockup } from "@/components/allma/brand";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Shield, Siren, MapPin, MessageSquare } from "lucide-react";

export function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <div className="signal-streak pointer-events-none fixed inset-0 -z-10 opacity-70" />
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" aria-label="Allma Safety AI home">
            <BrandLockup />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/auth"
              className="rounded-full border border-border/60 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-accent"
            >
              Sign in
            </Link>
            <Link
              to="/chat"
              className="hidden items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 text-[13px] font-bold text-primary-foreground shadow-soft sm:inline-flex"
            >
              Open Allma <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <section className="grid items-center gap-8 py-10 sm:py-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:py-20">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              <Shield className="h-3.5 w-3.5" /> Uganda&apos;s safety assistant
            </span>
            <h1 className="mt-5 font-display text-4xl font-black leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
              Calm help when it matters most.
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              Talk to Allma AI about an emergency, report an incident, or find nearby help. Get a
              clear next step without filling out long forms.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link
                to="/sos"
                className="inline-flex items-center gap-2 rounded-full bg-destructive px-5 py-3 text-[13px] font-bold text-background shadow-soft"
              >
                <Siren className="h-4 w-4" /> Emergency SOS
              </Link>
              <Link
                to="/chat"
                className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-5 py-3 text-[13px] font-bold"
              >
                <MessageSquare className="h-4 w-4 text-primary" /> Chat with Allma
              </Link>
            </div>
            <div className="mt-7 grid gap-2 text-[12px] text-muted-foreground sm:grid-cols-3">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Free to use</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Available 24/7</span>
              <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-primary" /> Built for Uganda</span>
            </div>
          </div>

          <section className="min-h-[560px] overflow-hidden rounded-[2rem] border border-border/60 bg-card/30 shadow-2xl backdrop-blur-sm lg:min-h-[620px]">
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
              <div>
                <p className="text-[12px] font-bold">Allma Safety AI</p>
                <p className="text-[10px] text-muted-foreground">Ready to help you now</p>
              </div>
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" /> Online
              </span>
            </div>
            <div className="flex min-h-[510px] flex-1">
              <AllmaChat key="landing-guest" threadId={null} />
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
