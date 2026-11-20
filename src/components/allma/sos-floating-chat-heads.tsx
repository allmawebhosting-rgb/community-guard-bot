import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import robotAvatar from "@/assets/allma-robot.png";
import { Avatar } from "@/components/allma/safety-network/add-safety-contact";
import {
  participantConnectionLabel,
  participantRoleLabel,
  type ConversationParticipant,
} from "@/lib/sos-participants";
import { cn } from "@/lib/utils";

/**
 * WhatsApp-style floating chat heads along the right edge of the emergency
 * conversation. Starts mid-screen so they don't fight the SOS / call chrome.
 */
export function SosFloatingChatHeads({
  participants,
  className,
}: {
  participants: ConversationParticipant[];
  className?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Humans only on the floating rail — Allma stays in the bubble stream.
  const humans = participants.filter((person) => person.role !== "ai");
  if (humans.length === 0) return null;

  const selected = humans.find((person) => person.id === selectedId) ?? null;

  return (
    <div
      role="group"
      aria-label="Conversation participants"
      className={cn(
        "pointer-events-none absolute inset-y-0 right-0 z-20 flex w-[4.25rem] items-center justify-center sm:w-[4.75rem]",
        className,
      )}
    >
      <div className="pointer-events-auto flex max-h-[58vh] flex-col items-center gap-3 overflow-y-auto overscroll-contain py-2 pr-1.5 sm:gap-3.5 sm:pr-2.5">
        <AnimatePresence initial={false}>
          {humans.map((person, index) => {
            const isNew = person.role !== "owner" && person.connection !== "disconnected";
            const active = selectedId === person.id;
            return (
              <motion.button
                key={person.id}
                type="button"
                layout
                initial={{ opacity: 0, x: 18, scale: 0.82 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 12, scale: 0.85 }}
                transition={{ duration: 0.32, delay: Math.min(index * 0.04, 0.2), ease: [0.22, 1, 0.36, 1] }}
                onClick={() => setSelectedId((current) => (current === person.id ? null : person.id))}
                aria-label={`${person.name}, ${participantRoleLabel(person.role)}`}
                aria-pressed={active}
                className="relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "block rounded-full border-[2.5px] border-background shadow-[0_8px_22px_rgba(15,23,42,0.18)] ring-1 transition-transform",
                    person.connection === "connected"
                      ? "ring-success/70"
                      : person.connection === "disconnected"
                        ? "ring-muted-foreground/30 opacity-80"
                        : "ring-border/70",
                    active && "scale-105",
                    isNew && person.connection === "joined" && "animate-[pulse_1.6s_ease-out_2]",
                  )}
                >
                  {person.role === "ai" ? (
                    <img
                      src={robotAvatar}
                      alt=""
                      width={44}
                      height={44}
                      className="h-10 w-10 rounded-full object-cover sm:h-11 sm:w-11"
                    />
                  ) : (
                    <Avatar name={person.name} url={person.avatarUrl} size={44} />
                  )}
                </span>
                {person.connection === "connected" ? (
                  <span
                    className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-success"
                    aria-hidden
                  />
                ) : person.connection === "disconnected" ? (
                  <span
                    className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-muted-foreground/50"
                    aria-hidden
                  />
                ) : null}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selected ? (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none absolute right-[4.5rem] top-1/2 z-30 max-w-[10.5rem] -translate-y-1/2 rounded-2xl border border-border/70 bg-card/95 px-3 py-2 shadow-lift backdrop-blur-sm sm:right-[5.1rem]"
          >
            <p className="truncate text-[12px] font-semibold text-foreground">{selected.name}</p>
            <p className="truncate text-[10px] text-muted-foreground">
              {participantRoleLabel(selected.role)} · {participantConnectionLabel(selected.connection)}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
