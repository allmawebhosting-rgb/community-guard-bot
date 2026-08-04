import { motion } from "motion/react";
import { QUICK_ACTIONS } from "@/lib/allma";
import { cn } from "@/lib/utils";

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
        "group flex flex-col items-center justify-center gap-2 rounded-[1.5rem] border border-border/55 bg-card/80 p-3 text-center shadow-soft transition-all duration-200 backdrop-blur-sm",
        "hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/55 hover:shadow-lift",
        // desktop: allow horizontal layout
        "lg:flex-row lg:items-center lg:justify-start lg:gap-3 lg:rounded-2xl lg:px-4 lg:py-3 lg:text-left",
      )}
    >
      <span
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-2xl text-2xl shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:shadow-md shrink-0",
          "lg:h-10 lg:w-10 lg:rounded-xl lg:text-xl",
          action.iconColor,
        )}
        aria-hidden
      >
        {action.emoji}
      </span>

      <span className="w-full space-y-0.5 lg:text-left">
        <span className="block text-[12px] font-bold leading-tight text-foreground lg:text-[13px]">
          {action.label}
        </span>
        <span className="hidden text-[10.5px] leading-snug text-muted-foreground sm:block lg:text-[11px]">
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
  return (
    <div className={cn("space-y-2.5", className)}>
      <p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50 lg:text-left">
        Start with
      </p>

      {/* Mobile: 2-col square grid | Desktop: 2-col list */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-2 lg:gap-2">
        {QUICK_ACTIONS.map((action, index) => (
          <SquareCard
            key={action.id}
            action={action}
            index={index}
            onSelect={onSelect}
            baseDelay={0.3}
          />
        ))}
      </div>
    </div>
  );
}
