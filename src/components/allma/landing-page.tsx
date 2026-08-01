import { useEffect, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowRight, Bot, Check, MapPin, MessageSquare, Mic, Phone, Shield, Siren, Upload } from "lucide-react";
import { Mascot } from "@/components/allma/mascot";
import { BrandLockup } from "@/components/allma/brand";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const FEATURES = [
  { icon: Bot, label: "AI-First", description: "Chat naturally to report and get help" },
  { icon: Check, label: "Step by Step", description: "Guided questions so nothing is missed" },
  { icon: Siren, label: "Smart Suggestions", description: "Recommended actions for every situation" },
  { icon: Upload, label: "Media Support", description: "Photos, video, voice and location" },
  { icon: MapPin, label: "Built for Uganda", description: "Local emergency numbers and nearby help" },
];

const QUICK_STARTS = [
  { emoji: "🚨", label: "Emergency SOS", prompt: "This is an emergency. I need help right now." },
  { emoji: "🚔", label: "Report Crime", prompt: "I want to report a crime." },
  { emoji: "👤", label: "Missing Person", prompt: "I need to report a missing person." },
  { emoji: "🏥", label: "Find Hospital", prompt: "Find the nearest hospital." },
];

function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[2.5rem] border-[6px] border-card/80 bg-background shadow-2xl",
        className,
      )}
    >
      <div className="absolute left-1/2 top-3 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-muted" />
      {children}
    </div>
  );
}

function ChatPreview() {
  return (
    <div className="flex h-full flex-col bg-background p-4 pt-8">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/15">
          <Shield className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-[11px] font-semibold leading-none">Allma Safety AI</p>
          <p className="text-[9px] text-muted-foreground">Online</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-[1.1rem] rounded-tl-sm border border-border/50 bg-card/70 px-3 py-2 text-[11px] text-foreground shadow-sm">
          Hello 👋 I&apos;m Allma Safety AI. How can I help keep you safe today?
        </div>
        <div className="ml-auto w-fit rounded-[1.1rem] rounded-br-sm bg-gradient-to-br from-primary to-primary-glow px-3 py-2 text-[11px] text-primary-foreground shadow-sm">
          I lost my phone
        </div>
        <div className="rounded-[1.1rem] rounded-tl-sm border border-border/50 bg-card/70 px-3 py-2 text-[11px] text-foreground shadow-sm">
          I&apos;m sorry to hear that. Let me help you report it. Where did you last have it?
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-2">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">Ask Allma AI…</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Mic className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
            <ArrowRight className="h-3 w-3" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SosPreview() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-background p-4 pt-8 text-center">
      <div className="relative mt-4">
        <div className="sos-pulse absolute inset-0 rounded-full bg-primary/20" />
        <div className="relative grid h-32 w-32 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow shadow-2xl">
          <span className="font-display text-xl font-black tracking-[0.14em] text-primary-foreground">SOS</span>
        </div>
      </div>
      <p className="mt-6 text-[11px] font-semibold text-primary">Hold to activate</p>
      <p className="mt-1 text-[10px] text-muted-foreground">3 second safety hold</p>

      <div className="mt-6 w-full space-y-2">
        <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-card/70 p-2.5">
          <span className="text-[10px] font-medium">Police</span>
          <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
            <Phone className="h-3 w-3" /> 999
          </span>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (loading || !isAuthenticated || started.current) return;
    started.current = true;
    navigate({ to: "/chat", replace: true });
  }, [loading, isAuthenticated, navigate]);

  if (loading || isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="signal-streak pointer-events-none fixed inset-0 -z-10 opacity-80" />

      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4">
          <BrandLockup />
          <div className="flex items-center gap-2">
            <Link
              to="/auth"
              className="rounded-full border border-border/60 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-accent"
            >
              Sign in
            </Link>
            <Link
              to="/chat"
              className="rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02]"
            >
              Try it free
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8">
        <section className="relative overflow-hidden rounded-[2.5rem] border border-border/50 bg-card/50 p-6 pb-8 pt-10 sm:p-10 sm:pb-12 sm:pt-14">
          <div className="absolute inset-0 -z-10 hero-glow" />
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="text-center lg:text-left">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
              >
                <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-gold">
                  <Shield className="h-3.5 w-3.5" /> Uganda&apos;s AI Safety Assistant
                </span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, duration: 0.45 }}
                className="mt-5 font-display text-[2.6rem] font-black leading-[1.05] tracking-[-0.04em] sm:text-[3.4rem]"
              >
                Report. Get Help. <span className="brand-gradient-text">Stay Safe.</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.45 }}
                className="mt-4 text-[15px] leading-relaxed text-muted-foreground sm:text-base"
              >
                Chat with Allma Safety AI to report incidents, raise an SOS, find hospitals and
                police stations, and get calm, step-by-step safety guidance — built for Uganda.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.45 }}
                className="mt-6 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
              >
                <Link
                  to="/chat"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 text-[14px] font-bold text-primary-foreground shadow-lift transition-transform hover:scale-[1.02]"
                >
                  Open Allma AI <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/sos"
                  className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-6 py-3 text-[14px] font-bold text-primary transition-colors hover:bg-primary/15"
                >
                  <Siren className="h-4 w-4" /> Emergency SOS
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.45 }}
                className="mt-8 flex flex-wrap justify-center gap-2 lg:justify-start"
              >
                {FEATURES.map((feature) => (
                  <span
                    key={feature.label}
                    className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground backdrop-blur-sm"
                  >
                    <feature.icon className="h-3.5 w-3.5 text-gold" />
                    {feature.label}
                  </span>
                ))}
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="relative mx-auto flex max-w-md items-center justify-center gap-4 lg:max-w-none"
            >
              <PhoneFrame className="h-[320px] w-[170px] shrink-0 -rotate-6 sm:h-[380px] sm:w-[200px]">
                <ChatPreview />
              </PhoneFrame>
              <PhoneFrame className="h-[320px] w-[170px] shrink-0 rotate-6 sm:h-[380px] sm:w-[200px]">
                <SosPreview />
              </PhoneFrame>
              <Mascot size={130} className="pointer-events-none absolute -bottom-8 -right-4 hidden opacity-90 lg:flex" />
            </motion.div>
          </div>
        </section>

        <section className="mt-12">
          <div className="text-center">
            <h2 className="font-display text-2xl font-black tracking-[-0.02em] sm:text-3xl">
              Get started in seconds
            </h2>
            <p className="mt-2 text-[14px] text-muted-foreground">
              Tap any option below and Allma will guide you step by step.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {QUICK_STARTS.map((item, index) => (
              <Link
                key={item.label}
                to="/chat"
                search={{ q: item.prompt }}
                className="group flex flex-col items-center gap-3 rounded-[1.5rem] border border-border/60 bg-card/70 p-4 text-center shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent"
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-2xl transition-transform group-hover:scale-105">
                  {item.emoji}
                </span>
                <span className="text-[13px] font-bold">{item.label}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-14 rounded-[2.5rem] border border-border/50 bg-card/50 p-6 sm:p-10">
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="font-display text-xl font-black tracking-[-0.02em]">Why Allma?</h3>
              <ul className="mt-4 space-y-3 text-[14px] text-muted-foreground">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                    <Check className="h-3 w-3" />
                  </span>
                  <span>Free, private and available 24/7</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                    <Check className="h-3 w-3" />
                  </span>
                  <span>Built for Uganda with local emergency numbers and facilities</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                    <Check className="h-3 w-3" />
                  </span>
                  <span>Generates real reference numbers you can share with authorities</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                    <Check className="h-3 w-3" />
                  </span>
                  <span>Notifies your emergency contacts when SOS is activated</span>
                </li>
              </ul>
            </div>
            <div className="relative grid place-items-center overflow-hidden rounded-[2rem] bg-background/40 p-6">
              <Mascot size={200} className="relative z-10" />
              <div className="absolute inset-0 -z-10 opacity-60 hero-glow" />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50 bg-card/40 py-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 px-4 text-center sm:flex-row sm:text-left">
          <BrandLockup className="opacity-70" />
          <p className="max-w-md text-[11px] leading-relaxed text-muted-foreground/60">
            Allma Safety AI is independent and not officially connected to police or emergency
            services. In a life-threatening emergency, always call 999, 112 or 911.
          </p>
        </div>
      </footer>
    </div>
  );
}
