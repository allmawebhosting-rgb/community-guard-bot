import { useEffect, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  ArrowRight,
  Bot,
  Check,
  MapPin,
  MessageSquare,
  Mic,
  Phone,
  Shield,
  Siren,
  Sparkles,
  Upload,
  Zap,
} from "lucide-react";
import { Mascot } from "@/components/allma/mascot";
import { BrandLockup } from "@/components/allma/brand";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/lib/theme";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const FEATURES = [
  { icon: Bot, label: "AI-First", description: "Chat naturally to report and get help" },
  { icon: Check, label: "Step by Step", description: "Guided questions so nothing is missed" },
  {
    icon: Siren,
    label: "Smart Suggestions",
    description: "Recommended actions for every situation",
  },
  { icon: Upload, label: "Media Support", description: "Photos, video, voice and location" },
  {
    icon: MapPin,
    label: "Built for Uganda",
    description: "Local emergency numbers and nearby help",
  },
  { icon: Zap, label: "Instant", description: "Responses in seconds, no forms needed" },
];

const QUICK_STARTS = [
  {
    emoji: "🚨",
    label: "Emergency SOS",
    prompt: "This is an emergency. I need help right now.",
    color: "from-red-500/15 to-red-600/5 border-red-500/25 hover:border-red-500/45",
  },
  {
    emoji: "🚔",
    label: "Report Crime",
    prompt: "I want to report a crime.",
    color: "from-blue-500/15 to-blue-600/5 border-blue-500/25 hover:border-blue-500/45",
  },
  {
    emoji: "👤",
    label: "Missing Person",
    prompt: "I need to report a missing person.",
    color: "from-amber-500/15 to-amber-600/5 border-amber-500/25 hover:border-amber-500/45",
  },
  {
    emoji: "🏥",
    label: "Find Hospital",
    prompt: "Find the nearest hospital.",
    color: "from-emerald-500/15 to-emerald-600/5 border-emerald-500/25 hover:border-emerald-500/45",
  },
  {
    emoji: "👮",
    label: "Find Police",
    prompt: "Find the nearest police station.",
    color: "from-indigo-500/15 to-indigo-600/5 border-indigo-500/25 hover:border-indigo-500/45",
  },
  {
    emoji: "🚑",
    label: "Ambulance",
    prompt: "I need an ambulance immediately.",
    color: "from-rose-500/15 to-rose-600/5 border-rose-500/25 hover:border-rose-500/45",
  },
];

const STATS = [
  { value: "< 3s", label: "Average response" },
  { value: "24/7", label: "Always available" },
  { value: "100%", label: "Free to use" },
  { value: "🇺🇬", label: "Built for Uganda" },
];

function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[2.5rem] border-[5px] border-card/80 bg-background shadow-2xl",
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
          <p className="text-[9px] text-muted-foreground">● Online</p>
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
          <span className="font-display text-xl font-black tracking-[0.14em] text-primary-foreground">
            SOS
          </span>
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
  const { theme, toggleTheme } = useTheme();
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

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-6">
          <BrandLockup />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="grid h-9 w-9 place-items-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link
              to="/auth"
              className="rounded-full border border-border/60 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-accent"
            >
              Sign in
            </Link>
            <Link
              to="/chat"
              className="rounded-full bg-gradient-to-br from-primary to-primary-glow px-5 py-2 text-[13px] font-semibold text-primary-foreground shadow-soft transition-all hover:scale-[1.02] hover:shadow-lift"
            >
              Try it free →
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 pb-24">
        {/* ── Hero Section ─────────────────────────────────────────────── */}
        <section className="relative mt-8 overflow-hidden rounded-[2.5rem] border border-border/50 bg-card/40 px-8 py-14 sm:px-12 sm:py-20">
          <div className="absolute inset-0 -z-10 hero-glow" />
          {/* Animated gradient orbs */}
          <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-primary-glow/10 blur-3xl" />

          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Left: copy */}
            <div className="text-center lg:text-left">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
              >
                <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-gold">
                  <Shield className="h-3.5 w-3.5" /> Uganda&apos;s AI Safety Assistant
                </span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06, duration: 0.45 }}
                className="mt-6 font-display text-[3rem] font-black leading-[1.0] tracking-[-0.05em] sm:text-[3.8rem] lg:text-[4.2rem]"
              >
                Report. Get Help.{" "}
                <span className="brand-gradient-text block sm:inline">Stay Safe.</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.45 }}
                className="mt-5 text-[15.5px] leading-relaxed text-muted-foreground lg:text-[16px]"
              >
                Chat with Allma Safety AI to report incidents, raise an SOS, find hospitals and
                police stations, and get calm, step-by-step safety guidance — built for Uganda.
              </motion.p>

              {/* CTA buttons */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18, duration: 0.45 }}
                className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
              >
                <Link
                  to="/chat"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-7 py-3.5 text-[14.5px] font-bold text-primary-foreground shadow-lift transition-all hover:scale-[1.02] hover:shadow-xl"
                >
                  Open Allma AI <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/sos"
                  className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-7 py-3.5 text-[14.5px] font-bold text-primary transition-all hover:bg-primary/15 hover:scale-[1.01]"
                >
                  <Siren className="h-4 w-4" /> Emergency SOS
                </Link>
                <Link
                  to="/onboarding"
                  className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-6 py-3.5 text-[14.5px] font-bold transition-all hover:border-primary/40 hover:bg-primary/5"
                >
                  <Shield className="h-4 w-4 text-gold" /> Prepare my safety network
                </Link>
              </motion.div>

              {/* Feature pills */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.24, duration: 0.4 }}
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

            {/* Right: phone mockups */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="relative mx-auto flex max-w-md items-center justify-center gap-4 lg:max-w-none"
            >
              <PhoneFrame className="h-[340px] w-[175px] shrink-0 -rotate-6 shadow-2xl sm:h-[400px] sm:w-[210px]">
                <ChatPreview />
              </PhoneFrame>
              <PhoneFrame className="h-[340px] w-[175px] shrink-0 rotate-6 shadow-2xl sm:h-[400px] sm:w-[210px]">
                <SosPreview />
              </PhoneFrame>
              <Mascot
                size={120}
                className="pointer-events-none absolute -bottom-8 -right-4 hidden opacity-90 lg:flex"
              />
            </motion.div>
          </div>
        </section>

        {/* ── Stats bar ───────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-border/50 bg-card/60 py-5 text-center shadow-soft backdrop-blur-sm"
            >
              <span className="font-display text-2xl font-black tracking-tight text-foreground">
                {stat.value}
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </motion.section>

        {/* ── Quick starts ────────────────────────────────────────────── */}
        <section className="mt-12">
          <div className="mb-6 text-center">
            <h2 className="font-display text-2xl font-black tracking-[-0.02em] sm:text-3xl lg:text-[2rem]">
              Get started in seconds
            </h2>
            <p className="mt-2 text-[14px] text-muted-foreground">
              Tap any option below and Allma will guide you step by step.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {QUICK_STARTS.map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 14, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.05 * index, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <Link
                  to="/chat"
                  search={{ q: item.prompt }}
                  className={cn(
                    "group flex flex-col items-center gap-3 rounded-[1.5rem] border bg-gradient-to-b p-4 text-center shadow-soft transition-all hover:-translate-y-1 hover:shadow-lift",
                    item.color,
                  )}
                >
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-background/30 text-2xl transition-transform group-hover:scale-110 backdrop-blur-sm">
                    {item.emoji}
                  </span>
                  <span className="text-[12px] font-bold leading-tight">{item.label}</span>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Feature detail + Mascot ──────────────────────────────────── */}
        <section className="mt-14 grid gap-5 lg:grid-cols-2">
          {/* Why Allma */}
          <div className="rounded-[2.5rem] border border-border/50 bg-card/50 p-8">
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-gold">
              <Sparkles className="h-3 w-3" /> Why Allma?
            </span>
            <h3 className="mt-4 font-display text-2xl font-black tracking-[-0.02em]">
              Built for real emergencies
            </h3>
            <ul className="mt-5 space-y-4 text-[14px] text-muted-foreground">
              {[
                "Free, private and available 24/7 — no downloads needed",
                "Built for Uganda with local emergency numbers and nearby facilities",
                "Generates real reference numbers you can share with authorities",
                "Notifies your emergency contacts when SOS is activated",
                "No long forms — just natural conversation",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                    <Check className="h-3 w-3" />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Link
                to="/onboarding"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 text-[13.5px] font-bold text-primary-foreground shadow-soft transition-all hover:scale-[1.02] hover:shadow-lift"
              >
                Build my Emergency Circle <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Mascot panel */}
          <div className="relative grid place-items-center overflow-hidden rounded-[2.5rem] border border-border/50 bg-card/50 p-8">
            <div className="absolute inset-0 -z-10 hero-glow opacity-60" />
            <div className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative z-10 flex flex-col items-center gap-4 text-center">
              <Mascot size={220} className="relative z-10 drop-shadow-2xl" />
              <div className="rounded-2xl border border-border/50 bg-background/50 px-5 py-3 backdrop-blur-sm">
                <p className="text-[13px] font-semibold">
                  &ldquo;Hello! How can I keep you safe today?&rdquo;
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">— Allma Safety AI</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <section className="mt-12 rounded-[2.5rem] border border-border/50 bg-card/40 p-8 sm:p-10">
          <div className="mb-8 text-center">
            <h2 className="font-display text-2xl font-black tracking-[-0.02em] sm:text-3xl">
              How it works
            </h2>
            <p className="mt-2 text-[14px] text-muted-foreground">Three steps to safety</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Tell Allma what happened",
                desc: "Just type or speak naturally — no forms, no menus.",
              },
              {
                step: "02",
                title: "Answer guided questions",
                desc: "Allma asks one question at a time to build your report.",
              },
              {
                step: "03",
                title: "Get instant help",
                desc: "Your report is filed, authorities notified, help found nearby.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="relative flex flex-col gap-3 rounded-2xl border border-border/50 bg-background/40 p-6"
              >
                <span className="font-display text-[3rem] font-black leading-none tracking-[-0.05em] text-primary/15">
                  {item.step}
                </span>
                <h3 className="font-display text-[15px] font-bold">{item.title}</h3>
                <p className="text-[13px] text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/50 bg-card/40 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 text-center sm:flex-row sm:text-left">
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
