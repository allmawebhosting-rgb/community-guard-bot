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
    <div className={cn("flex flex-col items-center gap-6 pb-4 pt-6 sm:pt-10", className)}>
      {/* Logo with multi-layer glow */}
      <div className="relative flex flex-col items-center text-center">
        {/* Outer ambient glow */}
        <div className="pointer-events-none absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl animate-pulse-slow" />
        {/* Inner focused glow */}
        <div className="pointer-events-none absolute -top-6 left-1/2 h-36 w-36 -translate-x-1/2 rounded-full bg-primary-glow/20 blur-2xl animate-pulse-slow" style={{ animationDelay: "1.2s" }} />

        <motion.div
          initial={{ opacity: 0, scale: 0.7, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative animate-float"
        >
          {/* Halo ring */}
          <div className="absolute inset-0 -m-3 rounded-[2rem] bg-gradient-to-br from-primary/30 to-primary-glow/20 blur-lg" />
          <BrandMark className="relative h-20 w-20 rounded-3xl shadow-lift" />
        </motion.div>

        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-5"
        >
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            <span className="brand-gradient-text">Ask Allma</span>{" "}
            <span className="text-foreground">anything</span>
          </h1>
          <h2 className="brand-gradient-text font-display text-4xl font-bold tracking-tight sm:text-5xl">
            about your safety.
          </h2>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.45 }}
          className="relative mt-3 max-w-md text-sm leading-relaxed text-muted-foreground"
        >
          Your community safety co-pilot — report incidents, raise an SOS and
          find help nearby, all in one conversation.
        </motion.p>
      </div>

      {/* Stats pills */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.34, duration: 0.4 }}
        className="flex flex-wrap items-center justify-center gap-2"
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

      {/* Suggestion chips */}
      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((suggestion, index) => (
          <motion.button
            key={suggestion}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.38 + 0.05 * index, duration: 0.35 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onSelect(suggestion)}
            className="rounded-full border border-border/70 bg-card px-3.5 py-2 text-[13px] text-foreground shadow-soft transition-all hover:border-primary/50 hover:bg-accent hover:shadow-md"
          >
            {suggestion}
          </motion.button>
        ))}
      </div>

      <QuickActionGrid onSelect={onSelect} className="w-full max-w-xl" />

      <p className="max-w-xl text-center text-[11px] leading-relaxed text-muted-foreground/60">
        {DISCLAIMER}
      </p>
    </div>
  );
}
