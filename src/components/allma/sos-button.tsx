import { motion } from "motion/react";
import { useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

export function SosButton({ inline = false }: { inline?: boolean }) {
  const navigate = useNavigate();

  return (
    <motion.button
      type="button"
      aria-label="Emergency SOS"
      onClick={() => navigate({ to: "/sos", search: { instant: true } })}
      whileTap={{ scale: 0.92 }}
      className={inline ? "no-print flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-destructive text-destructive-foreground shadow-[0_6px_18px_-6px_rgba(220,38,38,0.6)] active:scale-95" : "no-print sos-pulse fixed right-3 top-[4.5rem] z-50 flex h-12 w-12 flex-col items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-[0_4px_20px_rgba(220,38,38,0.45)] transition-transform hover:scale-105 active:scale-95 sm:right-6 lg:h-14 lg:w-14"}
    >
      <ShieldAlert className="h-5 w-5 lg:h-4 lg:w-4" aria-hidden="true" />
      <span className="text-[9px] font-black uppercase tracking-widest lg:text-[8px]">SOS</span>
    </motion.button>
  );
}