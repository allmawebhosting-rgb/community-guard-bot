import { motion } from "motion/react";
import { FileWarning, Hospital, Siren, UserSearch, ChevronRight } from "lucide-react";
import { MascotAvatar } from "@/components/allma/mascot";
import { QUICK_ACTIONS } from "@/lib/allma";
import { cn } from "@/lib/utils";

/** Minimal ChatGPT-style empty state: greeting + a few suggestion prompts. */
const SUGGESTION_IDS = ["sos", "crime", "hospital", "missing"];
const META: Record<string, { title: string; desc: string; Icon: typeof Siren }> = {
  sos: { title: "Emergency SOS", desc: "Immediate help and location sharing", Icon: Siren },
  crime: { title: "Report Crime", desc: "Report an incident step by step", Icon: FileWarning },
  hospital: { title: "Find Hospital", desc: "Discover nearby medical facilities", Icon: Hospital },
  missing: { title: "Missing Person", desc: "Report and share a missing-person profile", Icon: UserSearch },
};

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
        "mx-auto flex min-h-[calc(100dvh-16rem)] w-full max-w-2xl flex-col items-center justify-center px-4 py-6",
        className,
      )}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
      >
        <MascotAvatar className="h-11 w-11" />
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.35 }}
        className="mt-4 text-center font-display text-2xl font-semibold tracking-tight sm:text-3xl"
      >
        How can I help you today?
      </motion.h1>
      <p className="mt-2 max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
        Your intelligent companion for safety, emergencies and everyday guidance.
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
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            className="group flex min-h-[4.5rem] items-center gap-3 rounded-[20px] border border-border/70 bg-card px-4 py-3 text-left shadow-soft transition-colors hover:border-chat-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent/40"
          >
            {(() => {
              const m = META[action.id];
              const Icon = m?.Icon ?? Siren;
              return (
                <>
                  <span aria-hidden className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-2xl", action.id === "sos" ? "bg-destructive/10 text-destructive" : "bg-chat-user text-chat-accent")}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{m?.title ?? action.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{m?.desc ?? action.description}</span>
                  </span>
                  <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                </>
              );
            })()}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
