import { motion } from "motion/react";
import { Clock, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Mascot } from "@/components/allma/mascot";
import { DISCLAIMER, QUICK_ACTIONS } from "@/lib/allma";
import { cn } from "@/lib/utils";

const BADGES = [
  { icon: Clock, label: "24/7 Available" },
  { icon: ShieldCheck, label: "100% Free" },
  { icon: Sparkles, label: "Step-by-step guidance" },
  { icon: Zap, label: "Instant response" },
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
    <div className={cn("w-full", className)}>
      {/* ── Desktop 2-column layout ─────────────────────────────────────── */}
      <div className="hidden lg:flex lg:min-h-[calc(100vh-6rem)] lg:items-start lg:gap-0">
        {/* Left panel — greeting */}
        <div className="flex flex-col justify-center px-10 py-12 lg:w-[42%] lg:sticky lg:top-0 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mb-6 flex justify-center"
          >
            <div className="relative">
              <div className="absolute -inset-6 rounded-full bg-gradient-to-br from-primary/20 via-primary-glow/10 to-transparent blur-2xl" />
              <Mascot size={160} priority className="relative z-10" />
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.45 }}
            className="text-center font-display text-[2.8rem] font-black leading-[1.0] tracking-[-0.05em]"
          >
            Hello, I&apos;m{" "}
            <span className="brand-gradient-text">Allma</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.17, duration: 0.4 }}
            className="mt-4 text-center text-[15px] leading-relaxed text-muted-foreground"
          >
            Your AI safety companion for Uganda. Report incidents, raise an SOS,
            or find help nearby — I&apos;ll guide you step by step.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24, duration: 0.4 }}
            className="mt-6 flex flex-wrap justify-center gap-2"
          >
            {BADGES.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-[11.5px] font-semibold text-muted-foreground backdrop-blur-sm"
              >
                <Icon className="h-3 w-3 text-primary" />
                {label}
              </span>
            ))}
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="mt-8 text-center text-[10.5px] leading-relaxed text-muted-foreground/50"
          >
            {DISCLAIMER}
          </motion.p>
        </div>

        {/* Right panel — action grid */}
        <div className="flex-1 border-l border-border/40 px-8 py-12 overflow-y-auto">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.35 }}
            className="mb-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/60"
          >
            How can I help you today?
          </motion.p>

          {/* 3-column grid on desktop */}
          <div className="grid grid-cols-3 gap-3">
            {GRID_IDS.map((id, index) => {
              const action = byId(id);
              const tint = TINTS[id];
              return (
                <motion.button
                  key={id}
                  type="button"
                  initial={{ opacity: 0, y: 14, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.15 + index * 0.05, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onSelect(action.prompt)}
                  className={cn(
                    "group flex flex-col items-start gap-3 rounded-2xl border p-4 text-left shadow-soft backdrop-blur-sm transition-all hover:shadow-lift",
                    tint.card,
                  )}
                >
                  <span
                    className={cn(
                      "grid h-11 w-11 place-items-center rounded-2xl text-xl shadow-sm transition-transform group-hover:scale-110",
                      tint.icon,
                    )}
                    aria-hidden
                  >
                    {action.emoji}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-bold leading-tight">{action.label}</span>
                    <span className="mt-1 block text-[11.5px] leading-snug text-muted-foreground">
                      {action.description}
                    </span>
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* More actions — pill row */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.35 }}
            className="mt-4 flex flex-wrap gap-2"
          >
            {MORE_IDS.map((id) => {
              const action = byId(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelect(action.prompt)}
                  className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-4 py-2 text-[12px] font-semibold transition-all hover:border-primary/45 hover:bg-accent hover:scale-[1.03]"
                >
                  <span aria-hidden>{action.emoji}</span>
                  {action.label}
                </button>
              );
            })}
          </motion.div>

          {/* All actions section */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.35 }}
            className="mt-8"
          >
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/50">
              Or type anything below
            </p>
            <div className="rounded-2xl border border-border/40 bg-card/30 p-4 backdrop-blur-sm">
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Try: <span className="text-foreground/80 font-medium">"My phone was stolen"</span>,{" "}
                <span className="text-foreground/80 font-medium">"I need an ambulance"</span>,{" "}
                <span className="text-foreground/80 font-medium">"There is a fire nearby"</span>, or{" "}
                <span className="text-foreground/80 font-medium">"My child is missing"</span>
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Mobile layout (unchanged) ───────────────────────────────────── */}
      <div className="flex flex-col items-center px-4 pb-4 pt-2 lg:hidden">
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
          {BADGES.slice(0, 3).map(({ icon: Icon, label }) => (
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
    </div>
  );
}
