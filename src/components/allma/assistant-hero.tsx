import { motion } from "motion/react";
import { BrandMark } from "@/components/allma/brand";
import { QuickActionGrid } from "@/components/allma/quick-actions";
import { DISCLAIMER } from "@/lib/allma";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Report a theft",
  "Find the nearest hospital",
  "Someone is missing",
  "Is my area safe tonight?",
];

export function AssistantHero({
  onSelect,
  className,
}: {
  onSelect: (prompt: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-7 pb-4 pt-6 sm:pt-12", className)}>
      <div className="relative flex flex-col items-center text-center">
        <div className="pointer-events-none absolute -top-16 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl animate-pulse-slow" />
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          <BrandMark className="h-20 w-20 rounded-3xl shadow-lift" />
        </motion.div>

        <h1 className="brand-gradient-text relative mt-5 font-display text-4xl font-bold tracking-tight sm:text-5xl">
          Allma Safety AI
        </h1>
        <p className="relative mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Your community safety co-pilot — report incidents, raise an SOS and find help nearby,
          all in one conversation.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((suggestion, index) => (
          <motion.button
            key={suggestion}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * index, duration: 0.35 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onSelect(suggestion)}
            className="rounded-full border border-border/70 bg-card px-3.5 py-2 text-[13px] text-foreground shadow-soft transition-colors hover:border-primary/50 hover:bg-accent"
          >
            {suggestion}
          </motion.button>
        ))}
      </div>

      <QuickActionGrid onSelect={onSelect} className="w-full max-w-xl" />

      <p className="max-w-xl text-center text-[11px] leading-relaxed text-muted-foreground/70">
        {DISCLAIMER}
      </p>
    </div>
  );
}
