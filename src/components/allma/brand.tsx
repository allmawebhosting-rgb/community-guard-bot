import allmaMark from "@/assets/allma-mark.png";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={allmaMark}
      alt="Allma Safety AI"
      className={cn("h-9 w-9 rounded-xl object-cover shadow-soft", className)}
    />
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
