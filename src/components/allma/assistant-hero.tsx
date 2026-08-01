import { motion } from "motion/react";
import {
  Bot,
  Clock,
  ImageIcon,
  Infinity as InfinityIcon,
  MapPin,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { BrandMark } from "@/components/allma/brand";
import { QuickActionGrid } from "@/components/allma/quick-actions";
import { DISCLAIMER } from "@/lib/allma";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "My phone was stolen",
  "Find nearest hospital",
  "Someone is missing",
  "Is my area safe?",
];

const STATS = [
  { icon: Clock, label: "Available 24/7" },
  { icon: ShieldCheck, label: "100% Free" },
  { icon: InfinityIcon, label: "Guides you step by step" },
];

const FEATURE_CARDS = [
  {
    title: "AI-First",
    description: "Natural conversations that understand your situation and guide the next safe step.",
    icon: Bot,
  },
  {
    title: "Step by Step",
    description: "One question at a time, with a calm workflow that never overwhelms the user.",
    icon: Sparkles,
  },
  {
    title: "Smart Suggestions",
    description: "Actions, recommendations, and follow-up prompts generated from the live case.",
    icon: ShieldCheck,
  },
  {
    title: "Media Support",
    description: "Photos, voice, video, and documents can be attached to strengthen the report.",
    icon: ImageIcon,
  },
  {
    title: "Built for Uganda",
    description: "Premium dark UI inspired by Uganda's energy, with warm alert tones and a polished AI safety brand voice.",
    icon: MapPin,
  },
];

export function AssistantHero({
  onSelect,
  className,
}: {
  onSelect: (prompt: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-4 pb-3 pt-4 sm:gap-5 sm:pt-8 lg:gap-6 lg:pt-10", className)}>
      <section className="relative w-full max-w-6xl overflow-hidden rounded-[2rem] border border-border/70 bg-card/80 px-4 py-6 shadow-soft backdrop-blur-xl sm:px-7 sm:py-8 lg:px-8 lg:py-9">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--primary)_16%,transparent),transparent_40%),radial-gradient(circle_at_bottom_right,_color-mix(in_oklab,var(--primary-glow)_10%,transparent),transparent_38%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent,transparent_52%,color-mix(in_oklab,var(--primary)_10%,transparent)_72%,transparent)]" />

        <div className="relative grid items-center gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="text-center lg:text-left">
            <div className="mb-4 inline-flex items-center gap-3 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground shadow-soft">
              <BrandMark className="h-5 w-5 rounded-full" />
              Allma Safety AI
            </div>

            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42 }}
              className="font-display text-[2.25rem] font-black leading-[0.94] tracking-[-0.05em] text-foreground sm:text-[3rem] lg:text-[4.35rem]"
            >
              Uganda&apos;s AI
              <br />
              <span className="brand-gradient-text">Safety Assistant</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.36 }}
              className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base"
            >
              Report, get help, stay safe. Allma Safety AI is your intelligent emergency companion that moves from understanding to evidence to next steps in one elegant conversation.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16, duration: 0.38 }}
              className="mt-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start"
            >
              {STATS.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/80 px-3 py-1.5 text-[12px] font-medium text-muted-foreground shadow-soft backdrop-blur-sm"
                >
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  {label}
                </span>
              ))}
            </motion.div>

            <div className="mt-5 flex flex-wrap gap-2 lg:justify-start">
              {SUGGESTIONS.map((suggestion, index) => (
                <motion.button
                  key={suggestion}
                  type="button"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.24 + index * 0.05, duration: 0.32 }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onSelect(suggestion)}
                  className="rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-[11px] font-semibold text-foreground shadow-soft transition-all hover:border-primary/50 hover:bg-accent"
                >
                  {suggestion}
                </motion.button>
              ))}
            </div>
          </div>

          <div className="relative mx-auto flex w-full max-w-[28rem] items-center justify-center">
            <div className="absolute -inset-8 rounded-[2rem] bg-[radial-gradient(circle,_color-mix(in_oklab,var(--primary)_18%,transparent),transparent_68%)] blur-3xl" />

            <div className="relative z-10 grid w-full gap-3 sm:grid-cols-2">
              <motion.div
                initial={{ opacity: 0, x: 16, y: 10 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ delay: 0.1, duration: 0.45 }}
                className="rounded-[2rem] border border-border/60 bg-[linear-gradient(180deg,rgba(17,17,17,0.94),rgba(7,7,7,0.98))] p-3 shadow-lift"
              >
                <div className="rounded-[1.35rem] border border-white/10 bg-[radial-gradient(circle_at_top,_color-mix(in_oklab,var(--primary)_26%,transparent),transparent_40%),linear-gradient(180deg,#0a0a0a,#111)] p-4">
                  <div className="mb-3 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Allma Safety AI</span>
                    <span>Online</span>
                  </div>
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
                    <BrandMark className="h-14 w-14 rounded-full" />
                  </div>
                  <div className="rounded-2xl border border-border/50 bg-card/75 p-3 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Hello</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">I&apos;m Allma Safety AI</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">How can I help you stay safe today?</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -16, y: 10 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ delay: 0.16, duration: 0.45 }}
                className="rounded-[2rem] border border-border/60 bg-[linear-gradient(180deg,rgba(17,17,17,0.94),rgba(7,7,7,0.98))] p-3 shadow-lift"
              >
                <div className="rounded-[1.35rem] border border-white/10 bg-[radial-gradient(circle_at_top,_color-mix(in_oklab,var(--destructive)_22%,transparent),transparent_35%),linear-gradient(180deg,#0a0a0a,#111)] p-4">
                  <div className="mb-3 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Emergency SOS</span>
                    <span>Hold to activate</span>
                  </div>
                  <div className="mb-4 flex h-32 items-center justify-center">
                    <div className="grid h-28 w-28 place-items-center rounded-full border-4 border-destructive/80 bg-destructive/20 text-center shadow-[0_0_24px_rgba(220,38,38,0.75)]">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white">SOS</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-foreground">
                    <div className="rounded-xl border border-border/50 bg-card/65 p-2">Share location</div>
                    <div className="rounded-xl border border-border/50 bg-card/65 p-2">Call police</div>
                    <div className="rounded-xl border border-border/50 bg-card/65 p-2">Call ambulance</div>
                    <div className="rounded-xl border border-border/50 bg-card/65 p-2">Emergency contacts</div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        <div className="relative mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURE_CARDS.map(({ title, description, icon: Icon }, index) => (
            <motion.article
              key={title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.05, duration: 0.35 }}
              className="rounded-[1.5rem] border border-border/60 bg-card/70 p-4 shadow-soft backdrop-blur-sm"
            >
              <div className="flex items-center gap-2 text-primary">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[12px] font-bold uppercase tracking-[0.18em] text-foreground">{title}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <QuickActionGrid onSelect={onSelect} className="w-full max-w-lg px-0" />

      <p className="hidden max-w-xl text-center text-[10.5px] leading-relaxed text-muted-foreground/55 sm:block">
        {DISCLAIMER}
      </p>
    </div>
  );
}
