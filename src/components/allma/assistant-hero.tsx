import { motion } from "motion/react";
import { FileWarning, Hospital, Siren, Users, ChevronRight } from "lucide-react";
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
    <div className={cn("mx-auto w-full max-w-2xl lg:max-w-5xl lg:pt-6", className)}>
      <div className="relative -mb-10 overflow-hidden sm:mx-4 sm:mt-4 sm:rounded-[2rem]">
        <img src={heroImg} alt="Allma, your safety assistant" width={1024} height={768} className="h-[22dvh] max-h-60 lg:h-56 lg:max-h-none [@media(max-height:700px)]:h-[14dvh] w-full object-cover object-[center_30%]" />
      </div>
      <div className="relative rounded-t-[2.25rem] bg-background px-4 pb-3 pt-5 sm:mx-4 sm:rounded-[2rem]">
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center font-display text-[1.75rem] font-bold leading-[1.08] tracking-tight text-chat-accent sm:text-3xl lg:text-4xl"
        >
          How can I help
          <br className="lg:hidden" />{" "}
          you today?
        </motion.h1>
        <p className="mx-auto [@media(max-height:700px)]:hidden mt-1.5 max-w-xs lg:max-w-md text-center text-[13px] lg:text-[15px] leading-snug text-foreground/80">
          Your intelligent companion for safety, emergencies and everyday guidance.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2.5 lg:mt-6 lg:grid-cols-4 lg:gap-4">
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
                className="group flex h-full flex-col items-start rounded-[1.25rem] border border-border/60 bg-card p-3 text-left shadow-soft transition-all hover:shadow-md lg:p-4 lg:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent/40"
              >
                <span className="flex w-full items-start justify-between">
                  <span aria-hidden className={cn("grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl lg:h-14 lg:w-14", m?.tone)}>
                    {IMGS[action.id] ? (
                      <img src={IMGS[action.id]} alt="" className="h-9 w-9 object-contain mix-blend-multiply lg:h-11 lg:w-11" />
                    ) : (
                      <Icon className="h-6 w-6" />
                    )}
                  </span>
                  <ChevronRight aria-hidden className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-2.5 text-[15px] font-bold leading-tight text-foreground">{m?.title ?? action.label}</span>
                <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground [@media(max-height:700px)]:hidden">{m?.desc ?? action.description}</span>
              </motion.button>
            );
          })}
        </div>

      </div>
    </div>
  );
}
