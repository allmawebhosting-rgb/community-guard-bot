import { motion } from "motion/react";
import { Clock, Infinity as InfinityIcon, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/allma/brand";
import { QuickActionGrid } from "@/components/allma/quick-actions";
import { DISCLAIMER } from "@/lib/allma";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "My phone was stolen",
  "Find nearest hospital",
  "Someone is missing",
  "Is my area safe?",
];

const STATS = [
  { icon: Clock, label: "Available 24/7" },
  { icon: ShieldCheck, label: "100% Free" },
  { icon: InfinityIcon, label: "Guides you step by step" },
];

export function AssistantHero({
  onSelect,
  className,
}: {
  onSelect: (prompt: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 pb-3 pt-4 sm:gap-5 sm:pt-8 lg:gap-6 lg:pt-10", className)}>

      {/* ── Logo + heading ─────────────────────────────── */}
      <div className="relative flex flex-col items-center text-center">
        {/* Glow orbs — tightly contained so they never overflow */}
        <div className="pointer-events-none absolute -top-8 left-1/2 h-36 w-36 -translate-x-1/2 rounded-full bg-primary/10 blur-2xl animate-pulse-slow sm:-top-14 sm:h-56 sm:w-56 sm:blur-3xl" />
        <div className="pointer-events-none absolute top-0 left-1/2 h-20 w-20 -translate-x-1/2 rounded-full bg-primary-glow/15 blur-xl animate-pulse-slow sm:h-32 sm:w-32" style={{ animationDelay: "1.2s" }} />

        {/* Floating logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="relative animate-float"
        >
          <div className="absolute inset-0 -m-2 rounded-[1.75rem] bg-gradient-to-br from-primary/25 to-primary-glow/15 blur-lg" />
          <BrandMark className="relative h-14 w-14 rounded-3xl shadow-lift sm:h-16 sm:w-16 lg:h-20 lg:w-20" />
        </motion.div>

        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-3"
        >
          <h1 className="font-display text-[1.55rem] font-bold leading-tight tracking-tight sm:text-[2rem] lg:text-5xl">
            <span className="brand-gradient-text">Ask Allma</span>{" "}
            <span className="text-foreground">anything</span>
          </h1>
          <h2 className="brand-gradient-text font-display text-[1.55rem] font-bold leading-tight tracking-tight sm:text-[2rem] lg:text-5xl">
            about your safety.
          </h2>
        </motion.div>

        {/* Subtitle — hidden on mobile to save space */}
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.4 }}
          className="relative mt-2 hidden max-w-md px-2 text-sm leading-relaxed text-muted-foreground sm:block"
        >
          Your community safety co-pilot — report incidents, raise an SOS and
          find help nearby, all in one conversation.
        </motion.p>
      </div>

      {/* ── Stats pills — desktop only ─────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, duration: 0.38 }}
        className="hidden flex-wrap items-center justify-center gap-2 sm:flex"
      >
        {STATS.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/80 px-3 py-1.5 text-[12px] font-medium text-muted-foreground shadow-soft backdrop-blur-sm"
          >
            <Icon className="h-3.5 w-3.5 text-primary" />
            {label}
          </span>
        ))}
      </motion.div>

      {/* ── Suggestion chips — horizontal scroll on mobile ─ */}
      <div className="w-full overflow-x-auto pl-4 pr-4 [&::-webkit-scrollbar]:hidden sm:overflow-visible sm:pl-0 sm:pr-0">
        <div className="flex gap-2 sm:flex-wrap sm:justify-center">
          {SUGGESTIONS.map((suggestion, index) => (
            <motion.button
              key={suggestion}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32 + 0.05 * index, duration: 0.32 }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelect(suggestion)}
              className="shrink-0 rounded-full border border-border/70 bg-card px-3 py-1.5 text-[12px] font-medium text-foreground shadow-soft transition-all hover:border-primary/50 hover:bg-accent"
            >
              {suggestion}
            </motion.button>
          ))}
        </div>
      </div>

      {/* ── 2×2 square action grid ─────────────────────── */}
      <QuickActionGrid onSelect={onSelect} className="w-full max-w-lg px-0" />

      {/* ── Disclaimer — desktop only ─────────────────── */}
      <p className="hidden max-w-xl text-center text-[10.5px] leading-relaxed text-muted-foreground/55 sm:block">
        {DISCLAIMER}
      </p>
    </div>
  );
}
