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
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3", className)}>
      {QUICK_ACTIONS.map((action, index) => (
        <motion.button
          key={action.id}
          type="button"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 * index, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onSelect(action.prompt)}
          className={cn(
            "flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-3 text-left text-sm font-medium shadow-soft transition-colors",
            "hover:border-primary/40 hover:bg-accent",
            action.tone === "urgent" && "border-destructive/30 bg-destructive/5 hover:bg-destructive/10",
          )}
        >
          <span aria-hidden className="text-base">
            {action.emoji}
          </span>
          <span className="min-w-0 truncate">{action.label}</span>
        </motion.button>
      ))}
    </div>
  );
}
