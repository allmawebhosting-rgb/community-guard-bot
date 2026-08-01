import { motion } from "motion/react";

/**
 * Subtle animated mesh gradient background using Uganda flag colors.
 * Red glow (top-left) + Yellow glow (bottom-right), slowly drifting.
 */
export function MeshBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      {/* Uganda red orb — top area, drifts slowly */}
      <motion.div
        className="absolute h-[700px] w-[700px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, #D90012 14%, transparent) 0%, transparent 65%)",
          top: "-15%",
          left: "-10%",
        }}
        animate={{ x: [0, 180, 80, 0], y: [0, 120, 260, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Uganda yellow orb — bottom area, drifts slowly */}
      <motion.div
        className="absolute h-[600px] w-[600px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, #FCDC04 9%, transparent) 0%, transparent 65%)",
          bottom: "-15%",
          right: "-10%",
        }}
        animate={{ x: [0, -140, -60, 0], y: [0, -100, -220, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Subtle secondary red accent — mid-right */}
      <motion.div
        className="absolute h-[350px] w-[350px] rounded-full opacity-50"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, #D90012 8%, transparent) 0%, transparent 70%)",
          top: "40%",
          right: "15%",
        }}
        animate={{ x: [0, -80, 40, 0], y: [0, 60, -80, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 4 }}
      />
    </div>
  );
}
