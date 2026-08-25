import allmaMark from "@/assets/allma-mark.png";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-background/60 shadow-soft",
        className,
      )}
    >
      <img
        src={allmaMark}
        alt="Allma Safety AI"
        className="h-full w-full scale-[1.55] object-contain"
      />
    </span>
  );
}

export function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <div className="leading-tight">
        <p className="font-display text-sm font-semibold tracking-tight">Allma Safety AI</p>
        <p className="text-[11px] text-muted-foreground">Community safety assistant</p>
      </div>
    </div>
  );
}
