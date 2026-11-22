import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Phone } from "lucide-react";
import allmaRobot from "@/assets/allma-robot.png";
import { Avatar } from "@/components/allma/safety-network/add-safety-contact";
import {
  participantConnectionLabel,
  participantRoleLabel,
  type ConversationParticipant,
} from "@/lib/sos-participants";
import { cn } from "@/lib/utils";

/**
 * Premium floating responder chat heads along the right edge of the emergency
 * conversation. Mid-screen stack so they clear SOS chrome and the composer.
 */
export function SosFloatingChatHeads({
  participants,
  className,
  highlightUserId,
  currentUserId,
}: {
  /** Signed-in user; never shown as an extra responder. */
  currentUserId?: string | null;
  participants: ConversationParticipant[];
  className?: string;
  /** Briefly emphasize a newly joined participant. */
  highlightUserId?: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const seen = new Set<string>();
  const ordered = [
    ...participants.filter((p) => p.role === "ai"),
    ...participants.filter((p) => p.role !== "ai"),
  ];
  const humans = ordered.filter((person) => {
    if (seen.has(person.id)) return false;
    seen.add(person.id);
    if (person.role === "ai") return true;
    return !currentUserId || person.id !== currentUserId;
  });
  const realPeople = humans.filter((p) => p.role !== "ai");

  useEffect(() => {
    if (!highlightUserId) return;
    setSelectedId(highlightUserId);
    const timer = window.setTimeout(() => {
      setSelectedId((current) => (current === highlightUserId ? null : current));
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [highlightUserId]);

  if (realPeople.length === 0) return null;

  const selected = humans.find((person) => person.id === selectedId) ?? null;

  return (
    <div
      role="group"
      aria-label="Conversation participants"
      className={cn(
        "pointer-events-none absolute inset-y-0 right-0 z-20 flex w-[4.75rem] items-center justify-center sm:w-[5.5rem]",
        className,
      )}
    >
      <div className="pointer-events-auto flex max-h-[52vh] flex-col items-center gap-3.5 overflow-y-auto overscroll-contain py-3 pr-1.5 sm:gap-4 sm:pr-2.5">
        <AnimatePresence initial={false}>
          {humans.map((person, index) => {
            const active = selectedId === person.id;
            const onCall = person.connection === "connected";
            const isHighlight = highlightUserId === person.id;
            return (
              <motion.button
                key={person.id}
                type="button"
                layout={!reduceMotion}
                initial={
                  reduceMotion
                    ? { opacity: 1, scale: 1 }
                    : { opacity: 0, x: 22, scale: 0.72, y: 8 }
                }
                animate={
                  reduceMotion
                    ? { opacity: 1, scale: 1 }
                    : {
                        opacity: 1,
                        x: 0,
                        y: onCall ? [0, -3, 0] : 0,
                        scale: isHighlight ? [1, 1.08, 1] : 1,
                      }
                }
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, x: 14, scale: 0.82 }
                }
                transition={
                  reduceMotion
                    ? { duration: 0.01 }
                    : {
                        duration: 0.42,
                        delay: Math.min(index * 0.05, 0.25),
                        ease: [0.22, 1, 0.36, 1],
                        y: onCall
                          ? { duration: 2.8, repeat: Infinity, ease: "easeInOut" }
                          : undefined,
                      }
                }
                onClick={() =>
                  setSelectedId((current) => (current === person.id ? null : person.id))
                }
                aria-label={`${person.name}, ${participantRoleLabel(person.role)}, ${participantConnectionLabel(person.connection)}`}
                aria-pressed={active}
                className="relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "relative block rounded-full bg-gradient-to-br from-background via-card to-muted p-[2.5px] shadow-[0_10px_28px_rgba(15,23,42,0.22)]",
                    onCall && "from-success/40 via-background to-success/20",
                    active && "scale-[1.04]",
                  )}
                >
                  <span
                    className={cn(
                      "block overflow-hidden rounded-full border-[2.5px] border-background bg-card ring-1 shadow-[0_0_14px_hsl(var(--success)/0.35)]",
                      onCall ? "ring-success/55" : "ring-border/60",
                    )}
                  >
                    {person.role === "ai" ? (
                      <img
                        src={allmaRobot}
                        alt=""
                        className="h-12 w-12 object-cover sm:h-14 sm:w-14"
                      />
                    ) : (
                      <span className="block h-12 w-12 sm:h-14 sm:w-14 [&>*]:!h-full [&>*]:!w-full">
                        <Avatar name={person.name} url={person.avatarUrl} size={56} />
                      </span>
                    )}
                  </span>
                </span>

                {onCall ? (
                  <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-background bg-success text-success-foreground shadow-sm">
                    <Phone className="h-2.5 w-2.5" strokeWidth={2.5} />
                  </span>
                ) : (
                  <span
                    className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500"
                    aria-hidden
                  />
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selected ? (
          <motion.div
            key={selected.id}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, x: 10, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 8, scale: 0.96 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.22 }}
            className="pointer-events-none absolute right-[4.75rem] top-1/2 z-30 max-w-[11.5rem] -translate-y-1/2 rounded-2xl border border-border/70 bg-card/95 px-3 py-2.5 shadow-lift backdrop-blur-md sm:right-[5.35rem]"
          >
            <p className="truncate text-[12.5px] font-semibold tracking-tight text-foreground">
              {selected.name}
            </p>
            <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
              {participantRoleLabel(selected.role)}
            </p>
            <p className="mt-1 text-[10.5px] text-muted-foreground">
              {selected.role === "ai" ? "Always here in this chat" : "Online"}
              {selected.role !== "ai"
                ? selected.connection === "connected"
                  ? " · Connected to emergency call"
                  : " · Participating in chat only"
                : ""}
            </p>
            <p
              className={cn(
                "mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                selected.connection === "connected"
                  ? "bg-success/15 text-success"
                  : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
              )}
            >
              {participantConnectionLabel(selected.connection)}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
