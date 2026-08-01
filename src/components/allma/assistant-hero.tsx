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
    <div className={cn("flex flex-col items-center gap-4 pb-3 pt-4 sm:gap-5 sm:pt-8 lg:gap-6 lg:pt-10", className)}>
      <div className="relative w-full max-w-3xl overflow-hidden rounded-[2rem] border border-border/70 bg-card/80 px-4 py-6 shadow-soft backdrop-blur-xl sm:px-7 sm:py-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_color-mix(in_oklab,var(--primary)_14%,transparent),transparent_40%),radial-gradient(circle_at_right,_color-mix(in_oklab,var(--primary-glow)_10%,transparent),transparent_36%)]" />
        <div className="relative flex flex-col items-center text-center">
          <div className="pointer-events-none absolute -top-8 left-1/2 h-36 w-36 -translate-x-1/2 rounded-full bg-primary/10 blur-2xl animate-pulse-slow sm:-top-14 sm:h-56 sm:w-56 sm:blur-3xl" />
          <div className="pointer-events-none absolute top-0 left-1/2 h-20 w-20 -translate-x-1/2 rounded-full bg-primary-glow/10 blur-xl animate-pulse-slow sm:h-32 sm:w-32" style={{ animationDelay: "1.2s" }} />

          <motion.div
            initial={{ opacity: 0, scale: 0.82, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
            className="relative animate-float"
          >
            <div className="absolute inset-0 -m-3 rounded-[2rem] avatar-glow" />
            <BrandMark className="relative h-14 w-14 rounded-3xl shadow-lift sm:h-16 sm:w-16 lg:h-20 lg:w-20" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="relative mt-4"
          >
            <p className="font-display text-lg font-semibold text-muted-foreground sm:text-xl">
              Hello 👋
            </p>
            <h1 className="font-display text-[1.55rem] font-bold leading-tight tracking-tight sm:text-[2rem] lg:text-5xl">
              <span className="text-foreground">I'm </span>
              <span className="brand-gradient-text">Allma Safety AI.</span>
            </h1>
            <h2 className="mt-1 font-display text-[1.15rem] font-semibold leading-tight tracking-tight text-foreground/80 sm:text-[1.45rem] lg:text-3xl">
              Your calm, instant safety companion.
            </h2>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16, duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
            className="relative mt-2 hidden max-w-lg px-2 text-sm leading-relaxed text-muted-foreground sm:block"
          >
            Report safely, raise an SOS, and discover nearby help through one beautifully simple conversation.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.38 }}
            className="mt-4 hidden flex-wrap items-center justify-center gap-2 sm:flex"
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

          <div className="mt-5 w-full overflow-x-auto pl-2 pr-2 [&::-webkit-scrollbar]:hidden sm:overflow-visible sm:pl-0 sm:pr-0">
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
                  className="shrink-0 rounded-full border border-border/70 bg-card/80 px-3 py-1.5 text-[12px] font-medium text-foreground shadow-soft transition-all hover:border-primary/50 hover:bg-accent"
                >
                  {suggestion}
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <QuickActionGrid onSelect={onSelect} className="w-full max-w-lg px-0" />

      <p className="hidden max-w-xl text-center text-[10.5px] leading-relaxed text-muted-foreground/55 sm:block">
        {DISCLAIMER}
      </p>
    </div>
  );
}
