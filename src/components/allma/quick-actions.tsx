import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronRight } from "lucide-react";
import { QUICK_ACTIONS } from "@/lib/allma";
import { cn } from "@/lib/utils";

const PRIMARY_ACTIONS = QUICK_ACTIONS.slice(0, 4);
const SECONDARY_ACTIONS = QUICK_ACTIONS.slice(4);

function SquareCard({
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
      type="button"
      initial={{ opacity: 0, scale: 0.88, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        delay: baseDelay + 0.07 * index,
        duration: 0.4,
        ease: [0.16, 1, 0.3, 1],
      }}
      whileHover={{ y: -4, scale: 1.03 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => onSelect(action.prompt)}
      className={cn(
        "group flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl border border-border/40 p-3 text-center shadow-soft transition-all duration-200",
        "hover:border-border/60 hover:shadow-lift",
        action.cardBg,
      )}
    >
      {/* Colored icon circle */}
      <span
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-2xl text-2xl shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:shadow-md",
          action.iconColor,
        )}
        aria-hidden
      >
        {action.emoji}
      </span>

      {/* Label */}
      <span className="w-full space-y-0.5">
        <span className="block text-[12px] font-bold leading-tight text-foreground">
          {action.label}
        </span>
        <span className="hidden text-[10.5px] leading-snug text-muted-foreground sm:block">
          {action.description}
        </span>
      </span>
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
    <div className={cn("space-y-2.5", className)}>
      {/* Section label */}
      <p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50">
        Start with
      </p>

      {/* Primary 2×2 square grid */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {PRIMARY_ACTIONS.map((action, index) => (
          <SquareCard
            key={action.id}
            action={action}
            index={index}
            onSelect={onSelect}
            baseDelay={0.3}
          />
        ))}
      </div>

      {/* Secondary actions (expandable) */}
      <AnimatePresence>
        {showAll && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-2 pt-2 sm:gap-3">
              {SECONDARY_ACTIONS.map((action, index) => (
                <SquareCard
                  key={action.id}
                  action={action}
                  index={index}
                  onSelect={onSelect}
                  baseDelay={0}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle */}
      <div className="flex justify-center pt-0.5">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={() => setShowAll((prev) => !prev)}
          className="flex items-center gap-1.5 rounded-full border border-border/50 bg-card px-4 py-1.5 text-[11px] font-medium text-muted-foreground shadow-soft transition-all hover:border-primary/40 hover:text-foreground"
        >
          {showAll ? "Show fewer" : `See all ${QUICK_ACTIONS.length} options`}
          <ChevronRight
            className={cn(
              "h-3 w-3 transition-transform duration-300",
              showAll && "rotate-90",
            )}
          />
        </motion.button>
      </div>
    </div>
  );
}
