import { motion, AnimatePresence } from "motion/react";
import robotAvatar from "@/assets/allma-robot.png";
import { Avatar } from "@/components/allma/safety-network/add-safety-contact";
import {
  participantConnectionLabel,
  participantRoleLabel,
  type ConversationParticipant,
} from "@/lib/sos-participants";
import { cn } from "@/lib/utils";

/**
 * Messenger-inspired participant strip for an emergency conversation.
 * Shows the person in danger, Allma AI, and every authorised human who
 * joined by answering an SOS call — not Facebook branding, just the
 * familiar overlapping-avatar group-chat cue.
 */
export function SosParticipantStrip({
  participants,
  className,
}: {
  participants: ConversationParticipant[];
  className?: string;
}) {
  if (participants.length === 0) return null;

  const humans = participants.filter((person) => person.role !== "ai");
  const joinedHumans = humans.filter((person) => person.role !== "owner");
  const summary =
    joinedHumans.length === 0
      ? "Waiting for Safety Network to answer"
      : joinedHumans.length === 1
        ? `${joinedHumans[0].name} joined`
        : `${joinedHumans.length} responders in this chat`;

  return (
    <div
      role="region"
      aria-label="Conversation participants"
      className={cn(
        "shrink-0 border-b border-border/60 bg-background/90 px-3 py-2.5 backdrop-blur-sm sm:px-4",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 lg:max-w-4xl">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex shrink-0 items-center pl-1">
            <AnimatePresence initial={false} mode="popLayout">
              {participants.map((person, index) => (
                <motion.div
                  key={person.id}
                  layout
                  initial={{ opacity: 0, scale: 0.72, x: -6 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="relative"
                  style={{ marginLeft: index === 0 ? 0 : -10, zIndex: participants.length - index }}
                  title={`${person.name} · ${participantRoleLabel(person.role)} · ${participantConnectionLabel(person.connection)}`}
                >
                  {person.role === "ai" ? (
                    <img
                      src={robotAvatar}
                      alt=""
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full border-2 border-background object-cover shadow-sm ring-1 ring-border/70"
                    />
                  ) : (
                    <span
                      className={cn(
                        "block rounded-full border-2 border-background shadow-sm ring-1",
                        person.connection === "connected" ? "ring-success/70" : "ring-border/70",
                      )}
                    >
                      <Avatar name={person.name} url={person.avatarUrl} size={36} />
                    </span>
                  )}
                  {person.connection === "connected" ? (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-success"
                      aria-hidden
                    />
                  ) : null}
                  <span className="sr-only">
                    {person.name}, {participantRoleLabel(person.role)},{" "}
                    {participantConnectionLabel(person.connection)}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold leading-tight text-foreground">
              {summary}
            </p>
            <p className="truncate text-[10px] leading-tight text-muted-foreground">
              {participants
                .map((person) => (person.role === "ai" ? "Allma AI" : person.name))
                .join(" · ")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
