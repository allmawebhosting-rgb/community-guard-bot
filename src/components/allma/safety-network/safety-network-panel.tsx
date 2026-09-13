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
  ChevronRight,
  Clock3,
  LockKeyhole,
  Settings2,
  ShieldCheck,
  Users,
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
import { requestVoiceCall } from "@/lib/zego-call";
import {
  DEFAULT_SOS_CALLING_SETTINGS,
  loadSosCallingSettings,
  saveSosCallingSettings,
  type SosCallingSettings,
} from "@/lib/sos-calling-settings";
import { AddSafetyContactDialog, Avatar } from "./add-safety-contact";

export function SafetyNetworkPanel({ compact = false, workspace = false }: { compact?: boolean; workspace?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<SafetyConnection[]>([]);
  const [requests, setRequests] = useState<SafetyRequest[]>([]);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [discoverable, setDiscoverable] = useState(true);
  const [callingSettings, setCallingSettings] = useState<SosCallingSettings>(
    DEFAULT_SOS_CALLING_SETTINGS,
  );

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
    setCallingSettings(loadSosCallingSettings());
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

  function updateCallingSetting(key: keyof SosCallingSettings, value: string) {
    const next = {
      ...callingSettings,
      [key]: Number(value),
    };
    setCallingSettings(next);
    saveSosCallingSettings(next);
  }

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
  const priorityCounts = connections.reduce<Record<number, number>>((counts, connection) => {
    const priority = Math.min(Math.max(connection.priority || 3, 1), 3);
    counts[priority] = (counts[priority] ?? 0) + 1;
    return counts;
  }, {});

  const tierLabel = (priority: number) => priority === 1 ? "Primary responder" : priority === 2 ? "Backup responder" : "Additional responder";
  const configuredCount = connections.filter((item) => item.notify_on_sos && item.allow_emergency_calls).length;
  const readinessLabel = connections.length === 0
    ? "Not ready"
    : configuredCount === connections.length
      ? "Ready for SOS"
      : "Review permissions";

  async function setPriority(connection: SafetyConnection, priority: number) {
    const limit = priority === 1 ? 3 : priority === 2 ? 5 : Number.POSITIVE_INFINITY;
    const alreadyAssigned = Math.min(Math.max(connection.priority || 3, 1), 3) === priority;
    if (!alreadyAssigned && (priorityCounts[priority] ?? 0) >= limit) {
      toast.error(
        priority === 1
          ? "Primary responders can include up to 3 people."
          : "Backup responders can include up to 5 people.",
      );
      return;
    }
    await patch(connection, { priority });
  }

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <CompactMetric value={connections.length} label="Connected" />
          <CompactMetric value={incoming.length} label="Requests" />
          <CompactMetric value={configuredCount} label="SOS ready" />
        </div>
        {loading ? <Skeleton className="h-16 w-full rounded-xl" /> : connections.slice(0, 3).map((connection) => (
          <div key={connection.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 p-3">
            <Avatar name={connection.full_name} url={connection.avatar_url} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold">{connection.full_name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{connection.safety_role} · {tierLabel(connection.priority)}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        ))}
        {!loading && connections.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-[12px] text-muted-foreground">No trusted people connected yet.</p>}
      </div>
    );
  }

  return (
    <div className={cn("safety-network-shell", workspace && "safety-network-workspace")}>
      <aside className="safety-network-nav" aria-label="Safety Network sections">
        <div className="safety-network-nav-mark"><ShieldCheck className="h-5 w-5" /></div>
        <div>
          <p className="safety-network-kicker">Network readiness</p>
          <h2 className="mt-1 font-display text-xl font-bold">{readinessLabel}</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Only accepted people with your chosen permissions can respond through Allma.</p>
        </div>
        <nav className="safety-network-nav-links">
          <a href="#trusted-people" className="is-active"><Users className="h-4 w-4" /> Trusted people</a>
          <a href="#requests"><UserPlus className="h-4 w-4" /> Requests {incoming.length > 0 && <span>{incoming.length}</span>}</a>
          <a href="#network-settings"><Settings2 className="h-4 w-4" /> Network settings</a>
        </nav>
        <div className="safety-network-privacy-note"><LockKeyhole className="h-4 w-4" /><span>Phone numbers stay private. Location is shared only during SOS when permitted.</span></div>
      </aside>

      <div className="safety-network-main">
        <section className="safety-network-readiness" aria-label="Network readiness summary">
          <div>
            <p className="safety-network-kicker">Protection overview</p>
            <h2 className="mt-2 font-display text-2xl font-bold">Your response team at a glance</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">Keep trusted people connected and review what each person can receive during an emergency.</p>
          </div>
          <Button onClick={() => setAdding(true)} className="h-11 rounded-xl bg-trusted px-5 font-bold text-trusted-foreground hover:bg-trusted/90"><Plus className="h-4 w-4" /> Add trusted person</Button>
          <div className="safety-network-stats">
            <ReadinessMetric value={connections.length} label="Connected people" detail="Accepted by both sides" />
            <ReadinessMetric value={configuredCount} label="Ready for SOS calls" detail="Alerts and calls enabled" />
            <ReadinessMetric value={incoming.length + outgoing.length} label="Pending requests" detail="Awaiting a decision" />
          </div>
        </section>

        <section id="requests" className="scroll-mt-24 space-y-3">
          {incoming.length > 0 && <div className="safety-network-section-head"><div><p className="safety-network-kicker text-gold">Action needed</p><h2>Connection requests</h2></div><span className="safety-network-count">{incoming.length}</span></div>}
          {incoming.map((request) => (
            <article key={request.id} className="safety-request-card">
              <Avatar name={request.full_name} url={request.avatar_url} size={52} />
              <div className="min-w-0 flex-1"><h3 className="truncate">{request.full_name}</h3><p>Wants to join your Safety Network</p>{request.note && <p className="mt-1 italic">“{request.note}”</p>}</div>
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={busyId === request.id} onClick={() => void respond(request.id, "accept")} className="rounded-xl bg-trusted text-trusted-foreground hover:bg-trusted/90">{busyId === request.id ? <Loader2 className="animate-spin" /> : <Check />} Accept</Button>
                <Button variant="outline" size="icon" aria-label={`Decline ${request.full_name}`} onClick={() => void respond(request.id, "decline")}><X /></Button>
                <Button variant="ghost" size="icon" aria-label={`Block ${request.full_name}`} onClick={() => void respond(request.id, "block")} className="text-muted-foreground hover:text-destructive"><ShieldBan /></Button>
              </div>
            </article>
          ))}
        </section>

        <section id="trusted-people" className="scroll-mt-24">
          <div className="safety-network-section-head">
            <div><p className="safety-network-kicker">Your people</p><h2>Trusted responders</h2><p>{connections.length ? `${connections.length} connected through mutual consent` : "Build your network before an emergency happens"}</p></div>
            <Button variant="outline" onClick={() => setAdding(true)} className="rounded-xl"><UserPlus /> Add person</Button>
          </div>

          {connections.length > 0 && <div className="safety-tier-strip">{[1,2,3].map((priority) => <div key={priority}><span>{tierLabel(priority)}</span><strong>{priorityCounts[priority] ?? 0}</strong><small>{priority === 1 ? "Called first · up to 3" : priority === 2 ? "Called next · up to 5" : "Additional support"}</small></div>)}</div>}

          {loading ? <div className="grid gap-3 md:grid-cols-2">{[0,1].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div> : connections.length === 0 ? (
            <div className="safety-network-empty"><div className="safety-network-empty-icon"><Users /></div><h3>No trusted people yet</h3><p>Add someone you trust. They must accept before they become part of your emergency response team.</p><Button onClick={() => setAdding(true)} className="mt-5 rounded-xl bg-trusted text-trusted-foreground hover:bg-trusted/90"><UserPlus /> Add your first person</Button></div>
          ) : <div className="safety-contact-grid">{connections.map((connection) => {
            const isOpen = expanded === connection.id;
            const enabledPermissions = [connection.notify_on_sos, connection.share_location_on_sos, connection.allow_emergency_calls].filter(Boolean).length;
            return <article key={connection.id} className={cn("safety-contact-card", isOpen && "is-open")}>
              <button type="button" onClick={() => setExpanded(isOpen ? null : connection.id)} className="safety-contact-summary">
                <Avatar name={connection.full_name} url={connection.avatar_url} size={56} />
                <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><h3 className="truncate">{connection.full_name}</h3>{connection.phone_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-trusted" />}</div><p>{connection.safety_role}</p><div className="mt-2 flex flex-wrap gap-1.5"><span className="safety-role-badge">{tierLabel(connection.priority)}</span><span className="safety-permission-badge">{enabledPermissions}/3 permissions</span></div></div>
                <span className="safety-edit-label">{isOpen ? "Close" : "Manage"}<ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} /></span>
              </button>
              <div className="safety-contact-quick-actions">
                <Button variant="outline" disabled={!connection.allow_emergency_calls} onClick={() => requestVoiceCall({ id: connection.member_id, name: connection.full_name, avatarUrl: connection.avatar_url })} className="h-9 flex-1 rounded-lg"><PhoneCall /> In-app call</Button>
                <span className={cn("safety-ready-state", connection.notify_on_sos && connection.allow_emergency_calls ? "is-ready" : "is-review")}><span />{connection.notify_on_sos && connection.allow_emergency_calls ? "SOS ready" : "Review access"}</span>
              </div>
              <AnimatePresence initial={false}>{isOpen && <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden"><div className="safety-contact-editor">
                <fieldset><legend>Response tier</legend><div className="grid gap-2 sm:grid-cols-3">{[1,2,3].map((priority) => <button key={priority} type="button" onClick={() => void setPriority(connection, priority)} className={cn("safety-tier-option", Math.min(Math.max(connection.priority || 3,1),3) === priority && "is-selected")}><strong>{tierLabel(priority)}</strong><span>{priority === 1 ? "Called first" : priority === 2 ? "Called next" : "Called after backups"}</span></button>)}</div></fieldset>
                <fieldset><legend>Relationship</legend><div className="flex flex-wrap gap-2">{SAFETY_ROLES.map((role) => <button key={role} type="button" onClick={() => void patch(connection,{safety_role:role})} className={cn("safety-chip", connection.safety_role === role && "is-selected")}>{role}</button>)}</div></fieldset>
                <fieldset><legend>Emergency permissions</legend><div className="space-y-2"><PermissionRow icon={Bell} label="Receive my SOS alerts" description="Notify this person when I activate SOS." checked={connection.notify_on_sos} onChange={(next) => void patch(connection,{notify_on_sos:next})} /><PermissionRow icon={MapPin} label="See my location during SOS" description="Share location only while the emergency is active." checked={connection.share_location_on_sos} onChange={(next) => void patch(connection,{share_location_on_sos:next})} /><PermissionRow icon={PhoneCall} label="Use in-app emergency calls" description="Allow protected Allma calls between both people." checked={connection.allow_emergency_calls} onChange={(next) => void patch(connection,{allow_emergency_calls:next})} /></div></fieldset>
                <Button variant="ghost" disabled={busyId === connection.id} onClick={() => void remove(connection)} className="text-muted-foreground hover:text-destructive"><Trash2 /> Remove from Safety Network</Button>
              </div></motion.div>}</AnimatePresence>
            </article>})}</div>}

          {outgoing.length > 0 && <div className="mt-6"><div className="safety-network-section-head"><div><p className="safety-network-kicker text-gold">Awaiting acceptance</p><h2>Sent requests</h2></div></div><div className="grid gap-3 md:grid-cols-2">{outgoing.map((request) => <article key={request.id} className="safety-pending-card"><Avatar name={request.full_name} url={request.avatar_url} size={44}/><div className="min-w-0 flex-1"><h3 className="truncate">{request.full_name}</h3><p><Clock3 className="h-3 w-3"/> Request pending</p></div><Button variant="ghost" onClick={() => void respond(request.id,"cancel")} className="text-muted-foreground hover:text-destructive">Cancel</Button></article>)}</div></div>}
        </section>

        <section id="network-settings" className="scroll-mt-24">
          <div className="safety-network-section-head"><div><p className="safety-network-kicker">Privacy and timing</p><h2>Network settings</h2></div></div>
          <div className="safety-settings-grid">
            <label className="safety-setting-row"><div><strong>Let people find me by phone number</strong><span>Search results show only your name and photo.</span></div><Switch checked={discoverable} onCheckedChange={(next) => void toggleDiscoverable(next)} /></label>
            <div className="safety-timing"><div><strong>SOS calling timing</strong><p>All people in the active response tier are called together before Allma continues to the next tier.</p></div><label><span>Response window</span><div><input type="number" min={10} max={120} value={callingSettings.responseWindowSeconds} onChange={(event) => updateCallingSetting("responseWindowSeconds",event.target.value)} /><small>seconds</small></div></label><label><span>Retry interval</span><div><input type="number" min={30} max={600} value={callingSettings.retryIntervalSeconds} onChange={(event) => updateCallingSetting("retryIntervalSeconds",event.target.value)} /><small>seconds</small></div></label></div>
          </div>
        </section>
      </div>
      <AddSafetyContactDialog open={adding} onOpenChange={setAdding} onRequestSent={() => void refresh()} />
    </div>
  );
}

function PermissionRow({ icon: Icon, label, description, checked, onChange }: { icon: typeof Bell; label: string; description: string; checked: boolean; onChange: (next: boolean) => void }) {
  return <label className="safety-permission-row"><span className="safety-permission-icon"><Icon /></span><span className="min-w-0 flex-1"><strong>{label}</strong><small>{description}</small></span><Switch checked={checked} onCheckedChange={onChange} /></label>;
}

function ReadinessMetric({ value, label, detail }: { value: number; label: string; detail: string }) {
  return <div><strong>{value}</strong><span>{label}</span><small>{detail}</small></div>;
}

function CompactMetric({ value, label }: { value: number; label: string }) {
  return <div className="rounded-xl bg-muted/50 p-3 text-center"><strong className="block font-display text-lg">{value}</strong><span className="text-[10px] font-bold text-muted-foreground">{label}</span></div>;
}

export { DEFAULT_PERMISSIONS };
