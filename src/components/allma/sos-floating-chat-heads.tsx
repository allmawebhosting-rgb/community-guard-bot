import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Phone, ShieldAlert, X } from "lucide-react";
import allmaRobot from "@/assets/allma-robot.png";
import { Avatar } from "@/components/allma/safety-network/add-safety-contact";
import {
  participantConnectionLabel,
  participantRoleLabel,
  type ConversationParticipant,
} from "@/lib/sos-participants";
import { cn } from "@/lib/utils";

const SOS_TAP_HINTS = [
  "Tap here for location",
  "Tap for SOS information",
  "Location & emergency details",
  "Tap to call 999 / 112",
] as const;

/**
 * Premium floating responder chat heads along the right edge of the emergency
 * conversation. Tap a head to open SOS details (map, calls, leave) without
 * crowding the message list.
 */
export function SosFloatingChatHeads({
  participants,
  className,
  highlightUserId,
  currentUserId,
  sosActive = false,
  sosDetails,
  detailsOpen: detailsOpenControlled,
  onDetailsOpenChange,
}: {
  /** Signed-in user; never shown as an extra responder. */
  currentUserId?: string | null;
  participants: ConversationParticipant[];
  className?: string;
  /** Briefly emphasize a newly joined participant. */
  highlightUserId?: string | null;
  /** When true, tapping a head opens the full SOS details panel. */
  sosActive?: boolean;
  /** Live SOS card (mounted always; visibility controlled via detailsOpen). */
  sosDetails?: ReactNode;
  detailsOpen?: boolean;
  onDetailsOpenChange?: (open: boolean) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [internalDetailsOpen, setInternalDetailsOpen] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const [hintDismissed, setHintDismissed] = useState(false);
  const detailsOpen = detailsOpenControlled ?? internalDetailsOpen;
  const setDetailsOpen = (open: boolean) => {
    onDetailsOpenChange?.(open);
    if (detailsOpenControlled === undefined) setInternalDetailsOpen(open);
    if (open) setHintDismissed(true);
  };

  useEffect(() => {
    if (!sosActive || detailsOpen || hintDismissed || reduceMotion) return;
    const timer = window.setInterval(() => {
      setHintIndex((current) => (current + 1) % SOS_TAP_HINTS.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, [sosActive, detailsOpen, hintDismissed, reduceMotion]);

  // The heads can be dragged anywhere on screen (Messenger-style). The
  // offset is remembered between visits; a real drag suppresses the tap
  // that would otherwise open the participant card on pointer-up.
  const [offset, setOffset] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = window.localStorage.getItem("allma.sosHeadsOffset");
      if (raw) {
        const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          return { x: parsed.x, y: parsed.y };
        }
      }
    } catch {
      // storage unavailable — start at the default right-edge position
    }
    return { x: 0, y: 0 };
  });
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const dragRef = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    moved: boolean;
  } | null>(null);
  const draggedRef = useRef(false);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: offsetRef.current.x,
      baseY: offsetRef.current.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    draggedRef.current = true;
    const minX = -(window.innerWidth - 110);
    const maxY = Math.max(0, window.innerHeight / 2 - 110);
    setOffset({
      x: Math.min(4, Math.max(minX, drag.baseX + dx)),
      y: Math.min(maxY, Math.max(-maxY, drag.baseY + dy)),
    });
  };
  const handlePointerEnd = () => {
    if (dragRef.current?.moved) {
      try {
        window.localStorage.setItem("allma.sosHeadsOffset", JSON.stringify(offsetRef.current));
      } catch {
        // position just won't persist
      }
    }
    dragRef.current = null;
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 0);
  };
  const handleClickCapture = (event: React.SyntheticEvent) => {
    if (draggedRef.current) {
      event.preventDefault();
      event.stopPropagation();
      draggedRef.current = false;
    }
  };
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
    if (sosActive) setDetailsOpen(true);
    const timer = window.setTimeout(() => {
      setSelectedId((current) => (current === highlightUserId ? null : current));
    }, 4200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightUserId, sosActive]);

  // Always mount sosDetails when SOS is live (location / dialing), even with
  // no other human heads yet.
  if (realPeople.length === 0 && !sosDetails) return null;

  const selected = humans.find((person) => person.id === selectedId) ?? null;
  const panelOnRight = offset.x < -140;

  const openForPerson = (personId: string) => {
    setSelectedId((current) => {
      const next = current === personId && detailsOpen ? null : personId;
      if (sosActive && sosDetails) {
        setDetailsOpen(next !== null);
      } else if (next === null) {
        setDetailsOpen(false);
      }
      return next;
    });
  };

  return (
    <div
      role="group"
      aria-label="Conversation participants"
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      className={cn(
        "pointer-events-none absolute inset-y-0 right-0 z-20 flex w-[4.75rem] items-center justify-center sm:w-[5.5rem]",
        className,
      )}
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClickCapture={handleClickCapture}
        className="pointer-events-auto flex max-h-[52vh] cursor-grab touch-none select-none flex-col items-center gap-3.5 overflow-y-auto overscroll-contain py-3 pr-1.5 active:cursor-grabbing sm:gap-4 sm:pr-2.5"
      >
        {sosActive && sosDetails ? (
          <div className="relative shrink-0">
            <AnimatePresence mode="wait">
              {!detailsOpen && !hintDismissed ? (
                <motion.div
                  key={SOS_TAP_HINTS[hintIndex]}
                  initial={
                    reduceMotion
                      ? { opacity: 1 }
                      : { opacity: 0, x: panelOnRight ? -8 : 8, scale: 0.96 }
                  }
                  animate={
                    reduceMotion
                      ? { opacity: 1 }
                      : { opacity: 1, x: 0, scale: 1, y: [0, -2, 0] }
                  }
                  exit={
                    reduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, x: panelOnRight ? -6 : 6, scale: 0.96 }
                  }
                  transition={
                    reduceMotion
                      ? { duration: 0.01 }
                      : {
                          duration: 0.35,
                          ease: [0.22, 1, 0.36, 1],
                          y: { duration: 2.2, repeat: Infinity, ease: "easeInOut" },
                        }
                  }
                  className={cn(
                    "pointer-events-none absolute top-1/2 z-40 w-max max-w-[9.5rem] -translate-y-1/2 rounded-2xl border border-destructive/25 bg-card/95 px-2.5 py-1.5 shadow-lift backdrop-blur-md",
                    panelOnRight
                      ? "left-[3.35rem] sm:left-[3.75rem]"
                      : "right-[3.35rem] sm:right-[3.75rem]",
                  )}
                >
                  <p className="text-[11px] font-semibold leading-snug text-destructive">
                    {SOS_TAP_HINTS[hintIndex]}
                  </p>
                  <span
                    className={cn(
                      "absolute top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-destructive/25 bg-card/95",
                      panelOnRight
                        ? "left-[-4px] border-b border-l"
                        : "right-[-4px] border-r border-t",
                    )}
                    aria-hidden
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
            <motion.button
              type="button"
              aria-label={detailsOpen ? "Hide emergency details" : "Show emergency details. Tap for location and SOS information."}
              aria-pressed={detailsOpen}
              animate={
                reduceMotion || detailsOpen
                  ? { scale: 1 }
                  : { scale: [1, 1.06, 1] }
              }
              transition={
                reduceMotion || detailsOpen
                  ? { duration: 0.01 }
                  : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
              }
              onClick={() => {
                const next = !detailsOpen;
                setDetailsOpen(next);
                if (!next) setSelectedId(null);
              }}
              className={cn(
                "relative grid h-12 w-12 place-items-center rounded-full border-2 border-background shadow-md sm:h-14 sm:w-14",
                detailsOpen
                  ? "bg-destructive text-destructive-foreground ring-2 ring-destructive/40"
                  : "bg-destructive/90 text-destructive-foreground ring-1 ring-destructive/50",
              )}
            >
              <ShieldAlert className="h-5 w-5 sm:h-6 sm:w-6" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-destructive">
                <span className="absolute inset-0 animate-ping rounded-full bg-destructive opacity-75" />
              </span>
            </motion.button>
          </div>
        ) : null}

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
                onClick={() => openForPerson(person.id)}
                aria-label={`${person.name}, ${participantRoleLabel(person.role)}, ${participantConnectionLabel(person.connection)}`}
                aria-pressed={active}
                className="relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "block overflow-hidden rounded-full border-2 border-background bg-card shadow-md",
                    onCall ? "ring-2 ring-success/60" : "ring-1 ring-border/60",
                    active && "scale-[1.05]",
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

      {/* Keep SOS controller mounted even when the panel is closed. */}
      {sosDetails ? (
        <div
          className={cn(
            detailsOpen
              ? cn(
                  "pointer-events-auto absolute top-1/2 z-30 max-h-[min(70vh,36rem)] w-[min(22rem,calc(100vw-5.25rem))] -translate-y-1/2 overflow-y-auto overscroll-contain rounded-2xl border border-destructive/20 bg-card/95 p-2.5 shadow-lift backdrop-blur-md",
                  panelOnRight
                    ? "left-[4.75rem] sm:left-[5.35rem]"
                    : "right-[4.75rem] sm:right-[5.35rem]",
                )
              : "pointer-events-none fixed left-[-100vw] top-0 h-px w-px overflow-hidden opacity-0",
          )}
          aria-hidden={!detailsOpen}
        >
          {detailsOpen ? (
            <div className="mb-2 flex items-start justify-between gap-2 px-1">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-destructive">
                  Emergency details
                </p>
                {selected ? (
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {selected.name} · {participantRoleLabel(selected.role)}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    Tap a person or close when done
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label="Close emergency details"
                onClick={() => {
                  setDetailsOpen(false);
                  setSelectedId(null);
                }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          {sosDetails}
        </div>
      ) : null}

      <AnimatePresence>
        {selected && !sosDetails ? (
          <motion.div
            key={selected.id}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, x: 10, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 8, scale: 0.96 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.22 }}
            className={cn(
              "pointer-events-none absolute top-1/2 z-30 max-w-[11.5rem] -translate-y-1/2 rounded-2xl border border-border/70 bg-card/95 px-3 py-2.5 shadow-lift backdrop-blur-md",
              panelOnRight
                ? "left-[4.75rem] sm:left-[5.35rem]"
                : "right-[4.75rem] sm:right-[5.35rem]",
            )}
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
