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
    <div className={cn("space-y-4", className)}>
      {/* Centered "START WITH" label */}
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/55">
        Start with
      </p>

      {/* 2-column portrait card grid */}
      <div className="grid grid-cols-2 gap-3">
        {QUICK_ACTIONS.map((action, index) => (
          <motion.button
            key={action.id}
            type="button"
            initial={{ opacity: 0, y: 18, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              delay: 0.05 * index,
              duration: 0.45,
              ease: [0.16, 1, 0.3, 1],
            }}
            whileHover={{ y: -4, scale: 1.025 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onSelect(action.prompt)}
            className={cn(
              "group flex flex-col items-start gap-3.5 rounded-2xl border border-border/40 px-4 py-4 text-left shadow-soft transition-all duration-200",
              "hover:border-border/70 hover:shadow-lift",
              action.cardBg,
            )}
          >
            {/* Vivid solid-color icon circle */}
            <span
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-2xl text-[22px] shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:shadow-md",
                action.iconColor,
              )}
              aria-hidden
            >
              {action.emoji}
            </span>

            {/* Title + description stacked */}
            <span className="min-w-0 w-full space-y-0.5">
              <span className="block text-[13.5px] font-bold leading-snug text-foreground">
                {action.label}
              </span>
              <span className="block text-[11.5px] leading-relaxed text-muted-foreground">
                {action.description}
              </span>
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
