import { useEffect, useState } from "react";
import { PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDuration, listMyCalls, type CallHistoryEntry } from "@/lib/zego-call";
import { Avatar } from "@/components/allma/safety-network/add-safety-contact";

function relative(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function CallHistory() {
  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState<CallHistoryEntry[]>([]);

  useEffect(() => {
    let active = true;
    void listMyCalls(20)
      .then((rows) => active && setCalls(rows))
      .catch(() => undefined)
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((index) => (
          <Skeleton key={index} className="h-14 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!calls.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border/60 p-4 text-center text-[12px] text-muted-foreground">
        No Allma calls yet. Calls you make or receive appear here.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {calls.map((call) => {
        const missed = call.status === "missed" || call.status === "declined";
        const Icon = missed
          ? PhoneMissed
          : call.direction === "incoming"
            ? PhoneIncoming
            : PhoneOutgoing;
        return (
          <div
            key={call.id}
            className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/45 p-3"
          >
            <Avatar name={call.full_name} url={call.avatar_url} size={38} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold">{call.full_name}</p>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Icon className={cn("h-3 w-3", missed && "text-destructive")} />
                <span className="capitalize">{missed ? call.status : call.direction}</span>
                {" · "}
                {relative(call.created_at)}
              </p>
            </div>
            {call.duration ? (
              <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                {formatDuration(call.duration)}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
