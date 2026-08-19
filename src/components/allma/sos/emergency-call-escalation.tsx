import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Phone, PhoneOff, ShieldCheck, SquareStop } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/allma/safety-network/add-safety-contact";
import { requestVoiceCall } from "@/lib/zego-call";
import {
  ATTEMPT_COPY,
  answeredAttempt,
  attemptState,
  isTerminal,
  listSosCallAttempts,
  listSosCallTargets,
  type SosCallAttempt,
  type SosCallTarget,
} from "@/lib/sos-calling";

/**
 * Sequential emergency calling over the real in-app call system.
 * Every status shown here comes from an actual call row — nothing is simulated.
 * Escalation only advances while this screen is open; that limit is stated in the UI.
 */
export function EmergencyCallEscalation({
  activityId,
  emergencyType,
}: {
  activityId: string | null;
  emergencyType: string;
}) {
  const [targets, setTargets] = useState<SosCallTarget[]>([]);
  const [attempts, setAttempts] = useState<SosCallAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const indexRef = useRef(0);
  const advancingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!activityId) return;
    try {
      setAttempts(await listSosCallAttempts(activityId));
    } catch {
      // A transient read failure must not break the emergency screen.
    }
  }, [activityId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const eligible = await listSosCallTargets();
        if (active) setTargets(eligible);
      } catch {
        if (active) setTargets([]);
      } finally {
        if (active) setLoading(false);
      }
      await refresh();
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  // One subscription for the whole emergency; torn down on unmount.
  useEffect(() => {
    if (!activityId) return;
    let userId: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
      if (!userId) return;
      channel = supabase
        .channel(`sos-emergency-calls-${activityId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "emergency_calls",
            filter: `caller_id=eq.${userId}`,
          },
          (payload) => {
            const row = payload.new as { sos_session_id?: string | null } | null;
            if (row && row.sos_session_id !== activityId) return;
            void refresh();
          },
        )
        .subscribe();
    })();
    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [activityId, refresh]);

  const answered = useMemo(() => answeredAttempt(attempts), [attempts]);

  const callTarget = useCallback(
    (index: number) => {
      const target = targets[index];
      if (!activityId || !target) {
        setRunning(false);
        setExhausted(true);
        return;
      }
      indexRef.current = index;
      requestVoiceCall({
        id: target.member_id,
        name: target.full_name,
        avatarUrl: target.avatar_url,
        sosActivityId: activityId,
        emergencyType,
      });
    },
    [activityId, emergencyType, targets],
  );

  // Advance only when the current attempt has genuinely finished without an answer.
  useEffect(() => {
    if (!running || answered || advancingRef.current) return;
    const target = targets[indexRef.current];
    if (!target) return;
    const attempt = [...attempts]
      .reverse()
      .find((row) => row.recipient_id === target.member_id);
    if (!attempt || !isTerminal(attempt.status)) return;
    if (attempt.connected_at) return;

    advancingRef.current = true;
    const next = indexRef.current + 1;
    const timer = setTimeout(() => {
      advancingRef.current = false;
      if (next >= targets.length) {
        setRunning(false);
        setExhausted(true);
        return;
      }
      callTarget(next);
    }, 1500);
    return () => {
      clearTimeout(timer);
      advancingRef.current = false;
    };
  }, [answered, attempts, callTarget, running, targets]);

  useEffect(() => {
    if (answered) setRunning(false);
  }, [answered]);

  const start = () => {
    if (!activityId) {
      toast.error("Your emergency session is still starting.");
      return;
    }
    if (!targets.length) return;
    setExhausted(false);
    setRunning(true);
    callTarget(0);
  };

  const rows = targets.map((target) => {
    const attempt = [...attempts].reverse().find((row) => row.recipient_id === target.member_id);
    return { target, attempt };
  });

  return (
    <div className="premium-surface overflow-hidden rounded-3xl border border-border/60 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 p-4 sm:p-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-destructive">
            Emergency calling
          </p>
          <h3 className="mt-1 font-display text-lg font-black">Call your safety network</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            In-app voice calls in your configured priority order. One person at a time.
          </p>
        </div>
        {answered ? (
          <span className="rounded-full border border-success/30 bg-success/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-success">
            {answered.full_name.split(" ")[0]} is responding
          </span>
        ) : running ? (
          <button
            type="button"
            onClick={() => setRunning(false)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-[11px] font-bold"
          >
            <SquareStop className="h-3.5 w-3.5" /> Stop escalation
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={loading || !targets.length || !activityId}
            className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-3.5 py-2 text-[11px] font-bold text-background disabled:opacity-50"
          >
            <Phone className="h-3.5 w-3.5" /> Start emergency calling
          </button>
        )}
      </div>

      <div className="divide-y divide-border/60">
        {loading ? (
          <p className="p-4 text-[12px] text-muted-foreground">Checking eligible contacts…</p>
        ) : !rows.length ? (
          <p className="p-4 text-[12px] text-muted-foreground">
            No safety contact is currently eligible for emergency calls. Both of you must allow
            Allma calls, and SOS alerts must be on for that connection.
          </p>
        ) : (
          rows.map(({ target, attempt }, index) => {
            const state = attempt ? attemptState(attempt.status) : null;
            const copy = state ? ATTEMPT_COPY[state] : null;
            const isCurrent = running && indexRef.current === index && !answered;
            return (
              <div key={target.member_id} className="flex items-center gap-3 p-3.5">
                <Avatar name={target.full_name} url={target.avatar_url} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">{target.full_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {target.safety_role || "Safety contact"} · priority {target.priority}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-[11px] font-bold",
                    copy?.tone ?? "text-muted-foreground",
                    isCurrent && "text-gold",
                  )}
                >
                  {isCurrent && (!state || state === "alerted") ? "Calling" : (copy?.label ?? "—")}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="space-y-1.5 border-t border-border/60 p-4">
        {exhausted && !answered && (
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gold">
            <PhoneOff className="h-3.5 w-3.5" /> No trusted responder has answered yet.
          </p>
        )}
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          Calls stay inside Allma — phone numbers are never shared. Escalation continues while this
          screen stays open.
        </p>
      </div>
    </div>
  );
}
