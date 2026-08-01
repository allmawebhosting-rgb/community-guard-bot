import robot from "@/assets/allma-robot.png";
import { cn } from "@/lib/utils";

/** Glowing Allma robot mascot with a red/gold halo. */
export function Mascot({
  className,
  size = 168,
  priority = false,
}: {
  className?: string;
  size?: number;
  priority?: boolean;
}) {
  return (
    <div className={cn("relative grid place-items-center", className)} style={{ width: size, height: size }}>
      <div
        aria-hidden
        className="mascot-halo pointer-events-none absolute inset-0 rounded-full opacity-80"
        style={{ transform: "scale(1.35)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[12%] rounded-full border border-gold/40"
        style={{ boxShadow: "0 0 42px color-mix(in oklab, var(--color-primary) 45%, transparent)" }}
      />
      <img
        src={robot}
        alt="Allma Safety AI assistant"
        width={size}
        height={size}
        loading={priority ? "eager" : "lazy"}
        className="relative z-10 h-full w-full object-contain drop-shadow-[0_10px_40px_color-mix(in_oklab,var(--color-primary)_55%,transparent)]"
      />
    </div>
  );
}

/** Small circular mascot avatar used in the header and chat bubbles. */
export function MascotAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-gold/40 bg-gradient-to-b from-primary/25 to-background",
        className,
      )}
    >
      <img src={robot} alt="" width={36} height={36} loading="lazy" className="h-[130%] w-[130%] translate-y-[12%] object-contain" />
    </span>
  );
}
