import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Check, Loader2, ShieldCheck, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  type SafetyRequest,
  listRequests,
  respondToRequest,
} from "@/lib/safety-network";

type AppNotification = {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [requests, setRequests] = useState<SafetyRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [{ data }, safetyRequests] = await Promise.all([
      supabase
        .from("notifications")
        .select("id,title,body,kind,link,is_read,created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      listRequests().catch(() => [] as SafetyRequest[]),
    ]);
    setNotifications((data ?? []) as AppNotification[]);
    setRequests(safetyRequests.filter((request) => request.direction === "incoming"));
    setLoading(false);
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || cancelled) return;
      await refresh();

      channel = supabase
        .channel(`notifications-${auth.user.id}-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${auth.user.id}`,
          },
          (payload) => {
            const row = payload.new as AppNotification;
            setNotifications((current) => [row, ...current].slice(0, 20));
            if (row.kind === "safety_connection_request") void refresh();
            toast(row.title, { description: row.body ?? undefined });
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const unread = notifications.filter((item) => !item.is_read).length;
  const badge = unread + requests.length;

  async function markAllRead() {
    const ids = notifications.filter((item) => !item.is_read).map((item) => item.id);
    if (!ids.length) return;
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    await supabase.from("notifications").update({ is_read: true }).in("id", ids);
  }

  async function respond(id: string, action: "accept" | "decline") {
    setBusyId(id);
    try {
      await respondToRequest(id, action);
      toast.success(action === "accept" ? "Connected" : "Request declined");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          void refresh();
          void markAllRead();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="h-4 w-4" />
          {badge > 0 && (
            <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Notifications
          </p>
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="text-[11.5px] font-bold text-primary"
          >
            Safety network
          </Link>
        </div>

        <div className="max-h-[65vh] overflow-y-auto">
          {requests.length > 0 && (
            <div className="border-b border-border/60 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gold">
                <UserPlus className="h-3 w-3" /> Connection requests
              </p>
              <div className="space-y-2">
                {requests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center gap-2 rounded-xl bg-muted/40 p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-bold">{request.full_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Wants to join your safety network
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={busyId === request.id}
                      onClick={() => void respond(request.id, "accept")}
                      className="h-8 rounded-full px-3 text-[11.5px] font-bold"
                    >
                      {busyId === request.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <button
                      type="button"
                      aria-label={`Decline ${request.full_name}`}
                      disabled={busyId === request.id}
                      onClick={() => void respond(request.id, "decline")}
                      className="grid h-8 w-8 place-items-center rounded-full border border-border/60 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <p className="p-4 text-[12px] text-muted-foreground">Loading…</p>
          ) : notifications.length === 0 && requests.length === 0 ? (
            <div className="p-6 text-center">
              <ShieldCheck className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
              <p className="text-[12.5px] text-muted-foreground">You're all caught up.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {notifications.map((item) => (
                <li key={item.id} className={cn("px-4 py-3", !item.is_read && "bg-primary/5")}>
                  <p className="text-[12.5px] font-bold">{item.title}</p>
                  {item.body && (
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">{item.body}</p>
                  )}
                  <p className="mt-1 text-[10.5px] text-muted-foreground/70">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
