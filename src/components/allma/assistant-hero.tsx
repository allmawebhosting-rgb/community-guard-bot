import { motion } from "motion/react";
import { Clock, ShieldCheck, Sparkles } from "lucide-react";
import { Mascot } from "@/components/allma/mascot";
import { DISCLAIMER, QUICK_ACTIONS } from "@/lib/allma";
import { cn } from "@/lib/utils";

const BADGES = [
  { icon: Clock, label: "24/7" },
  { icon: ShieldCheck, label: "100% Free" },
  { icon: Sparkles, label: "Step by step" },
];

/** Ordered like the design: SOS, Report Crime, Missing Person, Lost & Found, Hospital, Police. */
const GRID_IDS = ["sos", "crime", "missing", "lost", "hospital", "police"];
const MORE_IDS = ["fire", "ambulance", "alerts", "ask"];

const TINTS: Record<string, { icon: string; card: string }> = {
  sos: { icon: "bg-primary text-primary-foreground", card: "border-primary/45 bg-primary/12" },
  crime: { icon: "bg-primary/85 text-primary-foreground", card: "border-primary/25 bg-primary/[0.07]" },
  missing: { icon: "bg-gold text-gold-foreground", card: "border-gold/30 bg-gold/[0.08]" },
  lost: { icon: "bg-gold/85 text-gold-foreground", card: "border-gold/25 bg-gold/[0.06]" },
  hospital: { icon: "bg-success text-success-foreground", card: "border-success/25 bg-success/[0.07]" },
  police: { icon: "bg-primary-glow text-primary-foreground", card: "border-primary/25 bg-primary/[0.07]" },
};

const byId = (id: string) => QUICK_ACTIONS.find((action) => action.id === id)!;

export function AssistantHero({
  onSelect,
  className,
}: {
  onSelect: (prompt: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-4 pb-4 pt-2", className)}>
      <Mascot size={180} priority className="mt-1" />

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mt-1 text-center font-display text-[2rem] font-black leading-[1] tracking-[-0.04em] sm:text-[2.4rem]"
      >
        Hello, I&apos;m <span className="brand-gradient-text">Allma</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.07, duration: 0.35 }}
        className="mt-2 max-w-sm text-center text-[13.5px] leading-relaxed text-muted-foreground"
      >
        Your AI safety companion for Uganda. Report incidents, raise an SOS, or find help nearby — I&apos;ll guide you
        step by step.
      </motion.p>

      <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
        {BADGES.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-[11px] font-semibold text-muted-foreground backdrop-blur-sm"
          >
            <Icon className="h-3 w-3 text-gold" />
            {label}
          </span>
        ))}
      </div>

      <div className="mt-6 grid w-full max-w-md grid-cols-2 gap-3">
        {GRID_IDS.map((id, index) => {
          const action = byId(id);
          const tint = TINTS[id];
          return (
            <motion.button
              key={id}
              type="button"
              initial={{ opacity: 0, y: 12, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.12 + index * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onSelect(action.prompt)}
              className={cn(
                "group flex flex-col items-start gap-2.5 rounded-[1.4rem] border p-3.5 text-left shadow-soft backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-lift",
                tint.card,
              )}
            >
              <span
                className={cn(
                  "grid h-11 w-11 place-items-center rounded-2xl text-xl shadow-sm transition-transform group-hover:scale-105",
                  tint.icon,
                )}
                aria-hidden
              >
                {action.emoji}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold leading-tight">{action.label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {action.description}
                </span>
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="mt-4 flex w-full max-w-md flex-wrap justify-center gap-2">
        {MORE_IDS.map((id) => {
          const action = byId(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(action.prompt)}
              className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-[11.5px] font-semibold transition-colors hover:border-primary/45 hover:bg-accent"
            >
              <span aria-hidden>{action.emoji}</span>
              {action.label}
            </button>
          );
        })}
      </div>

      <p className="mt-5 max-w-md text-center text-[10px] leading-relaxed text-muted-foreground/55">{DISCLAIMER}</p>
    </div>
  );
}
