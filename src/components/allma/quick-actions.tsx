import { motion } from "motion/react";
import { QUICK_ACTIONS } from "@/lib/allma";
import { cn } from "@/lib/utils";

export function QuickActionGrid({
  onSelect,
  className,
}: {
  onSelect: (prompt: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 px-0.5">
        Start with
      </p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2">
        {QUICK_ACTIONS.map((action, index) => (
          <motion.button
            key={action.id}
            type="button"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.04 * index, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ y: -2, scale: 1.015 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(action.prompt)}
            className={cn(
              "group relative flex items-start gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3.5 text-left shadow-soft transition-all duration-200",
              "hover:border-border hover:shadow-lift hover:bg-card",
              action.tone === "urgent" &&
                "border-destructive/20 bg-destructive/[0.03] hover:border-destructive/40 hover:bg-destructive/[0.06]",
            )}
          >
            {/* Colored icon circle */}
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg transition-transform duration-200 group-hover:scale-110",
                action.iconColor,
              )}
              aria-hidden
            >
              {action.emoji}
            </span>
            {/* Text */}
            <span className="min-w-0 flex-1 pt-0.5">
              <span className="block truncate text-sm font-semibold text-foreground leading-snug">
                {action.label}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                {action.description}
              </span>
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
