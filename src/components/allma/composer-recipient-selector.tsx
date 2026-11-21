import { motion } from "motion/react";
import { Bot, Users } from "lucide-react";
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
            icon: Bot,
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
              "relative flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-2 text-left shadow-sm ring-1 transition-colors",
              selected
                ? "bg-primary text-primary-foreground ring-primary/40 shadow-[0_8px_22px_-8px_hsl(142_70%_35%/0.6)]"
                : "bg-card text-foreground ring-border/60 hover:bg-muted/60",
              disabled && "opacity-60",
            )}
          >
            {selected ? (
              <motion.span
                layoutId="composer-recipient-pill"
                className="absolute inset-0 rounded-full bg-primary"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span
              className={cn(
                "relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full",
                selected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted/70",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="relative z-[1] min-w-0">
              <span className="block truncate text-[12px] font-semibold leading-tight sm:text-[13px]">
                {option.label}
              </span>
              <span className={cn("block truncate text-[10px] leading-tight", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {option.hint}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
