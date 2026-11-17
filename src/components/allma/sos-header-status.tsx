import { useSyncExternalStore } from "react";
import { Mic, MicOff, PhoneCall, PhoneOff, Volume2 } from "lucide-react";
import { MascotAvatar } from "@/components/allma/mascot";
import { Avatar } from "@/components/allma/safety-network/add-safety-contact";
import { getSosEscalation, type EscalationState } from "@/lib/sos-escalation-controller";
import { runSosInlineCallAction, useSosInlineCall } from "@/lib/sos-inline-call";
import type { ActiveSos } from "@/lib/sos-active";
import { cn } from "@/lib/utils";

const RINGING = ["queued", "initiating", "calling", "ringing"];
const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** Replaces the logo/title area of the header while an SOS is active. Every status comes from real call rows. */
export function SosHeaderStatus({ sos }: { sos: ActiveSos }) {
  const ctrl = getSosEscalation(sos.activityId, sos.type);
  const state: EscalationState = useSyncExternalStore(
    (l) => ctrl.subscribe(l),
    () => ctrl.state,
    () => ctrl.state,
  );
  const inline = useSosInlineCall();
  const call = inline?.activityId === sos.activityId ? inline : null;
  const locationSuffix = sos.locationShared ? " · Location shared" : "";

  if (call?.status === "connected") {
    return (
      <div className="flex min-w-0 items-center justify-center gap-2" role="status" aria-live="polite">
        <span className="relative shrink-0 rounded-full p-[2px] ring-2 ring-success sos-header-ring-ok">
          <Avatar name={call.name} url={call.avatarUrl ?? null} size={36} />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-destructive">
            Shared emergency conversation
          </p>
          <p className="truncate text-[14px] font-bold">{call.name}</p>
          <p className="flex items-center gap-1 text-[11px] font-semibold text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Connected · {fmt(call.seconds)}
            {locationSuffix}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={call.muted ? "Unmute" : "Mute"}
            onClick={() => runSosInlineCallAction("toggleMute")}
            className={cn(
              "grid h-8 w-8 place-items-center rounded-full border border-border bg-card",
              call.muted && "bg-foreground text-background",
            )}
          >
            {call.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <button
            type="button"
            aria-label="Speaker"
            onClick={() => runSosInlineCallAction("toggleSpeaker")}
            className={cn(
              "hidden h-8 w-8 place-items-center rounded-full border border-border bg-card min-[380px]:grid",
              call.speaker && "bg-primary text-primary-foreground",
            )}
          >
            <Volume2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="End call"
            onClick={() => void runSosInlineCallAction("hangUp")}
            className="grid h-8 w-8 place-items-center rounded-full bg-destructive text-destructive-foreground"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const callable = state.targets.filter((t) => !t.ineligible_reason);
  const ringing = state.attempts.filter((a) => RINGING.includes(a.status));
  const tried = new Set(state.attempts.map((a) => a.recipient_id)).size;
  const total = callable.length;
  let callLine: string;
  if (call?.status === "connecting") callLine = `${call.name} is picking up…`;
  else if (state.loading) callLine = "Loading your Safety Network…";
  else if (state.noTargets) callLine = "No callable contacts";
  else if (ringing.length)
    callLine = `Ringing ${ringing.map((a) => a.full_name.split(" ")[0]).join(", ")}`;
  else if (state.waitSeconds) callLine = `Next round in ${state.waitSeconds}s`;
  else callLine = "Waiting for Safety Network to join";

  return (
    <div className="flex min-w-0 items-center justify-center gap-2.5" role="status" aria-live="polite">
      <span className="sos-header-ring relative shrink-0 rounded-full">
        <MascotAvatar className="h-10 w-10" />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-destructive">
          Shared emergency conversation
        </p>
        <p className="flex items-center gap-1.5 truncate text-[13px] font-bold text-destructive">
          <PhoneCall className="h-3.5 w-3.5 shrink-0 animate-pulse" />
          Calling Safety Network
          {total ? (
            <span className="font-semibold text-muted-foreground">
              · {Math.min(tried, total)}/{total}
            </span>
          ) : null}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {callLine}
          {locationSuffix}
        </p>
      </div>
    </div>
  );
}
