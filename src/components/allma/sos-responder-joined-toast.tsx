import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { Avatar } from "@/components/allma/safety-network/add-safety-contact";
import type { ConversationParticipant } from "@/lib/sos-participants";
import { cn } from "@/lib/utils";

function playSoftJoinCue() {
  try {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 660;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.start(now);
    osc.stop(now + 0.3);
    window.setTimeout(() => void ctx.close(), 400);
  } catch {
    /* optional cue */
  }
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(18);
    }
  } catch {
    /* optional haptic */
  }
}

/**
 * Owner-only popup when an authorised responder answers and joins the
 * original shared emergency conversation. Dedupes by participant id.
 */
export function useResponderJoinedNotifications(args: {
  enabled: boolean;
  isOwner: boolean;
  ownerId?: string | null;
  participants: ConversationParticipant[];
  onHighlight?: (userId: string) => void;
}) {
  const seenRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);
  const [queue, setQueue] = useState<ConversationParticipant[]>([]);

  useEffect(() => {
    if (!args.enabled || !args.isOwner) return;
    const responders = args.participants.filter(
      (person) =>
        person.role !== "owner" &&
        person.role !== "ai" &&
        person.id !== args.ownerId &&
        person.connection !== "disconnected",
    );

    // First snapshot only seeds the seen set — avoids toasting historical joiners.
    if (!primedRef.current) {
      for (const person of responders) seenRef.current.add(person.id);
      primedRef.current = true;
      return;
    }

    const fresh = responders.filter((person) => !seenRef.current.has(person.id));
    if (fresh.length === 0) return;
    for (const person of fresh) seenRef.current.add(person.id);
    setQueue((current) => [...current, ...fresh]);
    args.onHighlight?.(fresh[0]!.id);
    playSoftJoinCue();
  }, [args.enabled, args.isOwner, args.onHighlight, args.ownerId, args.participants]);

  useEffect(() => {
    if (!args.enabled) {
      primedRef.current = false;
      seenRef.current = new Set();
      setQueue([]);
    }
  }, [args.enabled]);

  const current = queue[0] ?? null;
  const dismiss = () => setQueue((currentQueue) => currentQueue.slice(1));

  return { current, dismiss, pendingCount: queue.length };
}

export function SosResponderJoinedToast({
  participant,
  onDismiss,
  className,
}: {
  participant: ConversationParticipant | null;
  onDismiss: () => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!participant) return;
    const timer = window.setTimeout(onDismiss, 5600);
    return () => window.clearTimeout(timer);
  }, [onDismiss, participant?.id]);

  const body = useMemo(() => {
    if (!participant) return null;
    return (
      <>
        <p className="text-[13px] font-semibold tracking-tight text-foreground">
          Responder joined your emergency
        </p>
        <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">{participant.name}</span> has joined the
          conversation and can communicate with you and other authorised participants.
        </p>
      </>
    );
  }, [participant]);

  return (
    <AnimatePresence>
      {participant ? (
        <motion.div
          key={participant.id}
          role="status"
          aria-live="polite"
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "pointer-events-auto absolute left-1/2 top-3 z-40 w-[min(22rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl border border-border/70 bg-card/95 p-3 shadow-lift backdrop-blur-md",
            className,
          )}
        >
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 shrink-0 rounded-full bg-gradient-to-br from-emerald-400/30 via-background to-card p-[2px] shadow-sm">
              <span className="block overflow-hidden rounded-full border-2 border-background">
                <Avatar name={participant.name} url={participant.avatarUrl} size={44} />
              </span>
              <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" />
            </span>
            <div className="min-w-0 flex-1">{body}</div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={onDismiss}
              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
