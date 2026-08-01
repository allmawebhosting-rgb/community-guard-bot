import { motion } from "motion/react";

/**
 * Subtle animated mesh gradient background using Uganda flag colors.
 * Red glow (top-left) + Yellow glow (bottom-right), slowly drifting.
 */
export function MeshBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(circle_at_center,black,transparent_92%)]" />

      <motion.div
        className="absolute h-[720px] w-[720px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, #D90012 16%, transparent) 0%, transparent 67%)",
          top: "-18%",
          left: "-12%",
        }}
        animate={{ x: [0, 200, 60, 0], y: [0, 120, 240, 0], scale: [1, 1.04, 0.98, 1] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute h-[650px] w-[650px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, #FCDC04 11%, transparent) 0%, transparent 68%)",
          bottom: "-20%",
          right: "-12%",
        }}
        animate={{ x: [0, -150, -70, 0], y: [0, -110, -230, 0], scale: [1, 0.98, 1.03, 1] }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute h-[360px] w-[360px] rounded-full opacity-50"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, #D90012 9%, transparent) 0%, transparent 70%)",
          top: "42%",
          right: "14%",
        }}
        animate={{ x: [0, -80, 42, 0], y: [0, 60, -80, 0], scale: [1, 1.05, 0.98, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 4 }}
      />

      <motion.div
        className="absolute h-[280px] w-[280px] rounded-full opacity-40"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, #FCDC04 9%, transparent) 0%, transparent 72%)",
          top: "12%",
          right: "24%",
        }}
        animate={{ x: [0, 70, -24, 0], y: [0, -40, 52, 0], scale: [1, 0.96, 1.07, 1] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
    </div>
  );
}
