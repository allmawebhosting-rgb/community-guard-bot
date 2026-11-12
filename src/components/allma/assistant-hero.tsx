import { motion } from "motion/react";
import { MascotAvatar } from "@/components/allma/mascot";
import { QUICK_ACTIONS } from "@/lib/allma";
import { cn } from "@/lib/utils";

/** Minimal ChatGPT-style empty state: greeting + a few suggestion prompts. */
const SUGGESTION_IDS = ["sos", "crime", "hospital", "missing"];

export function AssistantHero({
  onSelect,
  className,
}: {
  onSelect: (prompt: string) => void;
  className?: string;
}) {
  const suggestions = SUGGESTION_IDS.map((id) => QUICK_ACTIONS.find((a) => a.id === id)).filter(
    (a): a is (typeof QUICK_ACTIONS)[number] => Boolean(a),
  );
  return (
    <div
      className={cn(
        "mx-auto flex min-h-[calc(100dvh-14rem)] w-full max-w-2xl flex-col items-center justify-center px-4 py-8",
        className,
      )}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
      >
        <MascotAvatar className="h-12 w-12" />
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.35 }}
        className="mt-4 text-center font-display text-2xl font-semibold tracking-tight sm:text-3xl"
      >
        How can I help you today?
      </motion.h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Ask anything about your safety, or pick a suggestion.
      </p>

      <div className="mt-8 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map((action, i) => (
          <motion.button
            key={action.id}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.04, duration: 0.3 }}
            onClick={() => onSelect(action.prompt)}
            className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card/60 px-4 py-3 text-left transition-colors hover:bg-accent"
          >
            <span aria-hidden className="text-lg leading-6">
              {action.emoji}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{action.label}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {action.description}
              </span>
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
