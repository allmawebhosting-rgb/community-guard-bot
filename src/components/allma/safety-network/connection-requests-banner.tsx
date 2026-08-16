import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  type SafetyRequest,
  listRequests,
  respondToRequest,
} from "@/lib/safety-network";

/**
 * Always-visible banner for incoming safety-connection requests so accepting
 * never depends on finding a bell or scrolling the profile page.
 */
export function ConnectionRequestsBanner() {
  const [requests, setRequests] = useState<SafetyRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await listRequests();
      setRequests(rows.filter((request) => request.direction === "incoming"));
    } catch {
      /* signed out or offline — banner simply stays hidden */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || cancelled) return;
      await refresh();

      channel = supabase
        .channel(`connection-requests-${auth.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "safety_connection_requests",
            filter: `recipient_id=eq.${auth.user.id}`,
          },
          () => void refresh(),
        )
        .subscribe();
    })();

    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refresh]);

  async function respond(id: string, action: "accept" | "decline") {
    setBusyId(id);
    try {
      await respondToRequest(id, action);
      toast.success(action === "accept" ? "Connected" : "Request declined");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not respond to the request");
    } finally {
      setBusyId(null);
    }
  }

  if (requests.length === 0) return null;

  return (
    <div className="no-print border-b border-gold/30 bg-gold/10">
      <div className="mx-auto w-full max-w-2xl space-y-2 px-3 py-2.5 sm:px-4 lg:max-w-4xl">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gold">
          <UserPlus className="h-3 w-3" /> {requests.length} connection request
          {requests.length > 1 ? "s" : ""}
        </p>
        {requests.map((request) => (
          <div
            key={request.id}
            className="flex items-center gap-2 rounded-xl bg-background/70 px-3 py-2"
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
                <Check className="mr-1 h-3.5 w-3.5" />
              )}
              Accept
            </Button>
            <button
              type="button"
              aria-label={`Decline ${request.full_name}`}
              disabled={busyId === request.id}
              onClick={() => void respond(request.id, "decline")}
              className="grid h-8 w-8 place-items-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
