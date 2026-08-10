import { motion } from "motion/react";
import { useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

export function SosButton() {
  const navigate = useNavigate();

  return (
    <motion.button
      type="button"
      aria-label="Emergency SOS"
      onClick={() => navigate({ to: "/sos", search: { instant: true } })}
      whileTap={{ scale: 0.92 }}
      className="no-print sos-pulse sos-blink fixed right-2.5 top-[58%] z-50 flex h-14 w-14 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-[0_4px_20px_rgba(220,38,38,0.45)] transition-transform hover:scale-105 active:scale-95 sm:right-6 sm:top-1/2 lg:h-14 lg:w-14"
    >
      <ShieldAlert className="h-5 w-5 lg:h-4 lg:w-4" />
      <span className="text-[9px] font-black uppercase tracking-widest lg:text-[8px]">SOS</span>
    </motion.button>
  );
}