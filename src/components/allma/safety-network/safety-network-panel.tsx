import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BadgeCheck,
  Bell,
  Check,
  Loader2,
  MapPin,
  PhoneCall,
  Plus,
  ShieldBan,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PERMISSIONS,
  SAFETY_ROLES,
  type SafetyConnection,
  type SafetyRequest,
  listConnections,
  listRequests,
  removeConnection,
  respondToRequest,
  updateConnection,
} from "@/lib/safety-network";
import { AddSafetyContactDialog, Avatar } from "./add-safety-contact";

export function SafetyNetworkPanel({ compact = false }: { compact?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<SafetyConnection[]>([]);
  const [requests, setRequests] = useState<SafetyRequest[]>([]);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [discoverable, setDiscoverable] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [nextConnections, nextRequests] = await Promise.all([listConnections(), listRequests()]);
      setConnections(nextConnections);
      setRequests(nextRequests);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load your safety network");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("discoverable_by_phone")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (data) setDiscoverable(data.discoverable_by_phone);
    })();
  }, [refresh]);

  async function toggleDiscoverable(next: boolean) {
    setDiscoverable(next);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ discoverable_by_phone: next })
      .eq("id", auth.user.id);
    if (error) {
      setDiscoverable(!next);
      toast.error("Could not update your discovery setting");
    }
  }

  async function respond(id: string, action: "accept" | "decline" | "cancel" | "block") {
    setBusyId(id);
    try {
      await respondToRequest(id, action);
      await refresh();
      toast.success(
        action === "accept"
          ? "Connected — set their safety role below"
          : action === "block"
            ? "Blocked"
            : action === "cancel"
              ? "Request cancelled"
              : "Request declined",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function patch(connection: SafetyConnection, values: Partial<SafetyConnection>) {
    setConnections((current) =>
      current.map((item) => (item.id === connection.id ? { ...item, ...values } : item)),
    );
    try {
      await updateConnection(connection.id, values as never);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
      void refresh();
    }
  }

  async function remove(connection: SafetyConnection) {
    setBusyId(connection.id);
    try {
      await removeConnection(connection.id);
      await refresh();
      toast.success("Removed from your safety network");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove");
    } finally {
      setBusyId(null);
    }
  }

  const incoming = requests.filter((request) => request.direction === "incoming");
  const outgoing = requests.filter((request) => request.direction === "outgoing");

  return (
    <div className="space-y-4">
      {incoming.length > 0 && (
        <section className="rounded-2xl border border-gold/30 bg-gold/5 p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-gold">
            {incoming.length} connection request{incoming.length > 1 ? "s" : ""}
          </p>
          <div className="space-y-2">
            {incoming.map((request) => (
              <div
                key={request.id}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-background/60 p-3"
              >
                <Avatar name={request.full_name} url={request.avatar_url} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">{request.full_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Wants to join your safety network
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    disabled={busyId === request.id}
                    onClick={() => void respond(request.id, "accept")}
                    className="h-9 rounded-full px-4 text-[12px] font-bold"
                  >
                    {busyId === request.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Accept
                  </Button>
                  <button
                    type="button"
                    aria-label={`Decline ${request.full_name}`}
                    onClick={() => void respond(request.id, "decline")}
                    className="grid h-9 w-9 place-items-center rounded-full border border-border/60 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Block ${request.full_name}`}
                    onClick={() => void respond(request.id, "block")}
                    className="grid h-9 w-9 place-items-center rounded-full border border-border/60 text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                  >
                    <ShieldBan className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {connections.length
              ? `${connections.length} connected`
              : "No safety connections yet"}
          </p>
          {!compact && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAdding(true)}
              className="h-8 rounded-full px-3 text-[11.5px] font-bold"
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Safety Contact
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1].map((index) => (
              <div key={index} className="flex items-center gap-3 rounded-2xl border border-border/50 p-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {connections.map((connection) => (
              <div
                key={connection.id}
                className="rounded-2xl border border-border/60 bg-background/45 transition-colors hover:border-trusted/35"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === connection.id ? null : connection.id)}
                  className="flex w-full items-center gap-3 p-3 text-left"
                >
                  <Avatar name={connection.full_name} url={connection.avatar_url} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">{connection.full_name}</p>
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {connection.safety_role}
                      {connection.phone_verified && (
                        <>
                          {" · "}
                          <BadgeCheck className="h-3 w-3 text-trusted" /> Verified
                        </>
                      )}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-primary">
                    {expanded === connection.id ? "Close" : "Edit"}
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {expanded === connection.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-4 border-t border-border/50 p-4">
                        <div>
                          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                            Safety role
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {SAFETY_ROLES.map((role) => (
                              <button
                                key={role}
                                type="button"
                                onClick={() => void patch(connection, { safety_role: role })}
                                className={cn(
                                  "rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-colors",
                                  connection.safety_role === role
                                    ? "border-primary/50 bg-primary/12 text-primary"
                                    : "border-border/60 text-muted-foreground hover:bg-accent",
                                )}
                              >
                                {role}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2.5">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                            Emergency permissions
                          </p>
                          <PermissionRow
                            icon={Bell}
                            label="Notify them when I trigger SOS"
                            checked={connection.notify_on_sos}
                            onChange={(next) => void patch(connection, { notify_on_sos: next })}
                          />
                          <PermissionRow
                            icon={MapPin}
                            label="Share my location during an emergency"
                            checked={connection.share_location_on_sos}
                            onChange={(next) => void patch(connection, { share_location_on_sos: next })}
                          />
                          <PermissionRow
                            icon={PhoneCall}
                            label="Allow emergency calls between us"
                            checked={connection.allow_emergency_calls}
                            onChange={(next) => void patch(connection, { allow_emergency_calls: next })}
                          />
                        </div>

                        <button
                          type="button"
                          disabled={busyId === connection.id}
                          onClick={() => void remove(connection)}
                          className="flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove from safety network
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {outgoing.map((request) => (
              <div
                key={request.id}
                className="flex items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-background/30 p-3"
              >
                <Avatar name={request.full_name} url={request.avatar_url} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">{request.full_name}</p>
                  <p className="text-[11px] text-gold">Request sent · awaiting acceptance</p>
                </div>
                <button
                  type="button"
                  onClick={() => void respond(request.id, "cancel")}
                  className="text-[11.5px] font-semibold text-muted-foreground hover:text-destructive"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/5 py-4 text-[13px] font-bold text-primary transition-colors hover:bg-primary/10"
        >
          <UserPlus className="h-4 w-4" /> Add Safety Contact
        </button>
      </section>

      <label className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background/35 p-3.5">
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-bold">Let people find me by phone number</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Only your name and photo are ever shown in a search result.
          </p>
        </div>
        <Switch checked={discoverable} onCheckedChange={(next) => void toggleDiscoverable(next)} />
      </label>

      <AddSafetyContactDialog open={adding} onOpenChange={setAdding} onRequestSent={() => void refresh()} />
    </div>
  );
}

function PermissionRow({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: typeof Bell;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl bg-background/50 px-3 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-[12px] font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export { DEFAULT_PERMISSIONS };
