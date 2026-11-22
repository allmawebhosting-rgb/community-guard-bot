import { motion } from "motion/react";
import { Check, Sparkles, Users } from "lucide-react";
import type { ChatRecipient } from "@/lib/chat-recipient";
import { cn } from "@/lib/utils";

export function ComposerRecipientSelector({
  value,
  onChange,
  disabled,
  respondersJoined,
}: {
  value: ChatRecipient;
  onChange: (next: ChatRecipient) => void;
  disabled?: boolean;
  respondersJoined: number;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Message recipient"
      className="mb-2 flex w-full items-center gap-1.5 gap-2 bg-transparent p-0"
    >
      {(
        [
          {
            id: "allma" as const,
            label: "Ask Allma AI",
            hint: "Ask Allma for guidance",
            icon: Sparkles,
          },
          {
            id: "responders" as const,
            label: "Message Responders",
            hint:
              respondersJoined > 0
                ? `${respondersJoined} in this chat`
                : "Visible when responders join",
            icon: Users,
          },
        ] as const
      ).map((option) => {
        const selected = value === option.id;
        const Icon = option.icon;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={cn(
              "relative flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-2.5 text-left shadow-sm ring-1 transition-[background-color,box-shadow,transform] active:scale-[0.99]",
              selected
                ? "bg-gradient-to-r from-success to-emerald-600 text-white ring-success/40 shadow-[0_8px_22px_-8px_hsl(var(--success)/0.6)]"
                : "bg-card text-foreground ring-border/70 hover:bg-success/5",
              disabled && "opacity-60",
            )}
          >
            {selected ? (
              <motion.span
                layoutId="composer-recipient-pill"
                className="absolute inset-0 rounded-full bg-success"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span
              className={cn(
                "relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full",
                selected ? "bg-white/20 text-white" : "bg-muted/70",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="relative z-[1] min-w-0">
                <span className="block truncate text-[12px] font-semibold leading-tight sm:text-[13px]">
                {option.label}
              </span>
                <span className={cn("block truncate text-[10px] leading-tight", selected ? "text-white/85" : "text-muted-foreground")}>
                {option.hint}
              </span>
            </span>
              {selected ? <Check className="relative z-[1] ml-auto h-4 w-4 shrink-0" strokeWidth={2.7} /> : null}
          </button>
        );
      })}
    </div>
  );
}
