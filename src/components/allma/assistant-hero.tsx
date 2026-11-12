import { motion } from "motion/react";
import { FileWarning, Hospital, Siren, Users, ChevronRight, ShieldCheck } from "lucide-react";
import heroImg from "@/assets/chat-hero-robot.jpg";
import sosImg from "@/assets/card-sos.png";
import crimeImg from "@/assets/card-crime.png";
import hospitalImg from "@/assets/card-hospital.png";
import missingImg from "@/assets/card-missing.png";
const IMGS: Record<string, string> = { sos: sosImg, crime: crimeImg, hospital: hospitalImg, missing: missingImg };
import { QUICK_ACTIONS } from "@/lib/allma";
import { cn } from "@/lib/utils";

const SUGGESTION_IDS = ["sos", "crime", "hospital", "missing"];
const META: Record<string, { title: string; desc: string; Icon: typeof Siren; tone: string }> = {
  sos: { title: "Emergency SOS", desc: "Immediate help & location sharing", Icon: Siren, tone: "bg-destructive/10 text-destructive" },
  crime: { title: "Report Crime", desc: "File a report step by step", Icon: FileWarning, tone: "bg-primary/10 text-primary" },
  hospital: { title: "Find Hospital", desc: "Discover nearby medical facilities", Icon: Hospital, tone: "bg-destructive/10 text-destructive" },
  missing: { title: "Missing Person", desc: "Report and share a profile", Icon: Users, tone: "bg-chat-user text-chat-accent" },
};

export function AssistantHero({ onSelect, className }: { onSelect: (prompt: string) => void; className?: string }) {
  const suggestions = SUGGESTION_IDS.map((id) => QUICK_ACTIONS.find((a) => a.id === id)).filter(
    (a): a is (typeof QUICK_ACTIONS)[number] => Boolean(a),
  );
  return (
    <div className={cn("mx-auto w-full max-w-2xl", className)}>
      <div className="relative -mb-10 overflow-hidden sm:mx-4 sm:mt-4 sm:rounded-[2rem]">
        <img src={heroImg} alt="Allma, your safety assistant" width={1024} height={768} className="h-[22dvh] max-h-60 [@media(max-height:700px)]:h-[14dvh] w-full object-cover object-[center_30%]" />
      </div>
      <div className="relative rounded-t-[2.25rem] bg-background px-4 pb-3 pt-5 sm:mx-4 sm:rounded-[2rem]">
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center font-display text-[1.75rem] font-bold leading-[1.08] tracking-tight text-chat-accent sm:text-3xl"
        >
          How can I help
          <br />
          you today?
        </motion.h1>
        <p className="mx-auto [@media(max-height:700px)]:hidden mt-1.5 max-w-xs text-center text-[13px] leading-snug text-foreground/80">
          Your intelligent companion for safety, emergencies and everyday guidance.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {suggestions.map((action, i) => {
            const m = META[action.id];
            const Icon = m?.Icon ?? Siren;
            return (
              <motion.button
                key={action.id}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + i * 0.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelect(action.prompt)}
                className="group flex flex-col rounded-[1.4rem] border border-border/60 bg-card p-3 text-left shadow-soft transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent/40"
              >
                {IMGS[action.id] ? (
                  <img src={IMGS[action.id]} alt="" aria-hidden className="h-10 w-auto self-start object-contain mix-blend-multiply sm:h-12" />
                ) : (
                  <span aria-hidden className={cn("grid h-10 w-10 place-items-center rounded-2xl", m?.tone)}><Icon className="h-6 w-6" /></span>
                )}
                <span className="mt-1.5 flex items-center gap-1">
                  <span className="min-w-0 flex-1 text-[15px] font-bold leading-tight text-foreground">{m?.title ?? action.label}</span>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-chat-user text-chat-accent">
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </span>
                <span className="mt-1 text-xs leading-snug text-muted-foreground [@media(max-height:700px)]:hidden">{m?.desc ?? action.description}</span>
              </motion.button>
            );
          })}
        </div>

        <div className="mt-2.5 flex items-center gap-3 rounded-[1.4rem] border border-chat-accent/15 bg-chat-user px-4 py-2">
          <ShieldCheck aria-hidden className="h-7 w-7 shrink-0 text-chat-accent" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">Together for a safer Uganda</p>
            <p className="text-xs text-muted-foreground">Be alert. Stay safe. Look out for others.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
