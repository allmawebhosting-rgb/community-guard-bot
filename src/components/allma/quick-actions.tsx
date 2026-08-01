import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronRight } from "lucide-react";
import { QUICK_ACTIONS } from "@/lib/allma";
import { cn } from "@/lib/utils";

const PRIMARY_ACTIONS = QUICK_ACTIONS.slice(0, 4);
const SECONDARY_ACTIONS = QUICK_ACTIONS.slice(4);

function ActionCard({
  action,
  index,
  onSelect,
  baseDelay = 0,
}: {
  action: (typeof QUICK_ACTIONS)[number];
  index: number;
  onSelect: (prompt: string) => void;
  baseDelay?: number;
}) {
  return (
    <motion.button
      key={action.id}
      type="button"
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: baseDelay + 0.06 * index,
        duration: 0.42,
        ease: [0.16, 1, 0.3, 1],
      }}
      whileHover={{ y: -3, scale: 1.018 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => onSelect(action.prompt)}
      className={cn(
        "group flex w-full items-center gap-3.5 rounded-2xl border border-border/40 px-4 py-3.5 text-left shadow-soft transition-all duration-200",
        "hover:border-border/70 hover:shadow-lift",
        action.cardBg,
      )}
    >
      {/* Colored icon circle */}
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:shadow-md",
          action.iconColor,
        )}
        aria-hidden
      >
        {action.emoji}
      </span>

      {/* Title + description */}
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block text-[13.5px] font-bold leading-snug text-foreground">
          {action.label}
        </span>
        <span className="block truncate text-[11.5px] leading-relaxed text-muted-foreground">
          {action.description}
        </span>
      </span>

      {/* Arrow */}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
    </motion.button>
  );
}

export function QuickActionGrid({
  onSelect,
  className,
}: {
  onSelect: (prompt: string) => void;
  className?: string;
}) {
  const [showAll, setShowAll] = useState(false);

  return (
    <div className={cn("space-y-3.5", className)}>
      {/* Section label */}
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/55">
        Start with
      </p>

      {/* Primary 2×2 grid */}
      <div className="grid grid-cols-2 gap-3">
        {PRIMARY_ACTIONS.map((action, index) => (
          <ActionCard key={action.id} action={action} index={index} onSelect={onSelect} baseDelay={0.45} />
        ))}
      </div>

      {/* Secondary actions (expandable) */}
      <AnimatePresence>
        {showAll && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-3 pt-1">
              {SECONDARY_ACTIONS.map((action, index) => (
                <ActionCard key={action.id} action={action} index={index} onSelect={onSelect} baseDelay={0} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* See more / see less toggle */}
      <div className="flex justify-center">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={() => setShowAll((prev) => !prev)}
          className="flex items-center gap-1.5 rounded-full border border-border/50 bg-card px-4 py-2 text-[12px] font-medium text-muted-foreground shadow-soft transition-all hover:border-primary/40 hover:text-foreground"
        >
          {showAll ? "Show fewer options" : `See all ${QUICK_ACTIONS.length} options`}
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-300",
              showAll && "rotate-90",
            )}
          />
        </motion.button>
      </div>
    </div>
  );
}
