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
    <div className={cn("flex flex-col items-center gap-5 pb-4 pt-5 sm:gap-6 sm:pt-10", className)}>
      {/* Logo with multi-layer glow — overflow-hidden parent keeps orbs clipped */}
      <div className="relative flex flex-col items-center text-center">
        {/* Ambient glow — clipped, won't overflow on mobile */}
        <div className="pointer-events-none absolute -top-10 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-primary/12 blur-3xl animate-pulse-slow sm:-top-16 sm:h-64 sm:w-64" />
        <div className="pointer-events-none absolute -top-2 left-1/2 h-28 w-28 -translate-x-1/2 rounded-full bg-primary-glow/18 blur-2xl animate-pulse-slow" style={{ animationDelay: "1.2s" }} />

        <motion.div
          initial={{ opacity: 0, scale: 0.7, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative animate-float"
        >
          {/* Halo ring */}
          <div className="absolute inset-0 -m-2.5 rounded-[2rem] bg-gradient-to-br from-primary/25 to-primary-glow/15 blur-lg" />
          <BrandMark className="relative h-16 w-16 rounded-3xl shadow-lift sm:h-20 sm:w-20" />
        </motion.div>

        {/* Heading — mobile-safe sizes */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-4"
        >
          <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            <span className="brand-gradient-text">Ask Allma</span>{" "}
            <span className="text-foreground">anything</span>
          </h1>
          <h2 className="brand-gradient-text font-display text-[1.75rem] font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            about your safety.
          </h2>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.45 }}
          className="relative mt-2.5 max-w-sm px-2 text-[13px] leading-relaxed text-muted-foreground sm:max-w-md sm:text-sm"
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
            className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/80 px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-soft backdrop-blur-sm sm:text-[12px]"
          >
            <Icon className="h-3 w-3 text-primary sm:h-3.5 sm:w-3.5" />
            {label}
          </span>
        ))}
      </motion.div>

      {/* Suggestion chips — horizontal scroll on mobile, wrap on larger */}
      <div className="flex w-full overflow-x-auto pb-1 pl-4 sm:flex-wrap sm:justify-center sm:overflow-visible sm:pl-0 [&::-webkit-scrollbar]:hidden">
        <div className="flex shrink-0 gap-2 sm:flex-wrap sm:justify-center">
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
              className="shrink-0 rounded-full border border-border/70 bg-card px-3.5 py-2 text-[12px] text-foreground shadow-soft transition-all hover:border-primary/50 hover:bg-accent sm:text-[13px]"
            >
              {suggestion}
            </motion.button>
          ))}
        </div>
      </div>

      <QuickActionGrid onSelect={onSelect} className="w-full max-w-xl" />

      <p className="max-w-sm px-4 text-center text-[10px] leading-relaxed text-muted-foreground/60 sm:max-w-xl sm:px-0 sm:text-[11px]">
        {DISCLAIMER}
      </p>
    </div>
  );
}
