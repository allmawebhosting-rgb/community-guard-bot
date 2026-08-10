import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, BadgeCheck, Bell, Check, CheckCircle2, Clock3,
  Compass, HeartHandshake, MapPin, Navigation, PhoneCall, ShieldCheck,
  Sparkles, UserRound, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/allma/app-shell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  AVAILABILITY_OPTIONS, RESPONDER_SKILLS, RESPONDER_TYPES, SERVICE_RADII,
  VERIFICATION_COPY, type ResponderAvailability, type ResponderStatus,
  formatApproximateDistance, isDangerousIncident, locationFreshness,
} from "@/lib/responder-network";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/responder")({
  head: () => ({
    meta: [
      { title: "Community responder — Allma Safety AI" },
      { name: "description", content: "Opt-in safely to help your community through Allma Safety AI." },
    ],
  }),
  component: ResponderScreen,
});

type Profile = {
  id: string;
  user_id: string;
  full_name: string;
  preferred_language: string;
  area_of_operation: string | null;
  responder_type: string;
  responder_level: string;
  verification_status: string;
  availability_status: ResponderAvailability;
  availability_until: string | null;
  service_radius_m: number;
  emergency_permissions: boolean;
  opted_in: boolean;
  location_permission_granted: boolean;
  safety_acknowledged: boolean;
  updated_at: string;
};

type Notification = {
  id: string;
  emergency_category: string;
  severity: string;
  approximate_distance_m: number | null;
  area: string | null;
  minimal_summary: string | null;
  notification_status: "pending" | "sent" | "delivered" | "viewed" | "accepted" | "declined" | "expired" | "cancelled";
  created_at: string;
};

type Assignment = {
  id: string;
  status: ResponderStatus;
  distance: number | null;
  sos_session_id: string | null;
  notes: string | null;
  assigned_at: string;
};

const db = supabase as unknown as {
  from: (table: string) => any;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function ResponderScreen() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDemo, setShowDemo] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data, error } = await db.from("community_responders").select("*").eq("user_id", user.id).maybeSingle();
    if (error) {
      toast.error("Responder services are not available yet. Apply the Phase 4 database migration first.");
      setLoading(false);
      return;
    }
    setProfile(data as Profile | null);
    if (data) {
      const [inbox, active] = await Promise.all([
        db.from("responder_notifications").select("*").eq("responder_id", data.id).order("created_at", { ascending: false }).limit(20),
        db.from("responder_assignments").select("id,status,distance,sos_session_id,notes,assigned_at").eq("responder_profile_id", data.id).in("status", ["accepted", "en_route", "arrived", "assisting", "need_official_help"]).order("assigned_at", { ascending: false }).limit(5),
      ]);
      if (!inbox.error) setNotifications((inbox.data ?? []) as Notification[]);
      if (!active.error) setAssignments((active.data ?? []) as Assignment[]);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [user]);

  if (loading) return <AppShell title="Community responder"><LoadingState /></AppShell>;
  if (!profile) return <AppShell title="Community responder"><ResponderOnboarding userId={user?.id ?? ""} onComplete={load} /></AppShell>;

  return (
    <AppShell title="Community responder">
      <ResponderDashboard
        profile={profile}
        notifications={notifications}
        assignments={assignments}
        showDemo={showDemo}
        onDemoChange={setShowDemo}
        onReload={load}
      />
    </AppShell>
  );
}

function ResponderOnboarding({ userId, onComplete }: { userId: string; onComplete: () => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    full_name: "",
    phone: "",
    preferred_language: "English",
    area_of_operation: "",
    responder_type: "community_volunteer",
    service_radius_m: 2000,
    skills: [] as string[],
    safety_acknowledged: false,
    location_permission_granted: false,
    emergency_permissions: false,
  });
  const responderType = RESPONDER_TYPES.find((type) => type.value === draft.responder_type);
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const toggleSkill = (skill: string) => set("skills", draft.skills.includes(skill) ? draft.skills.filter((item) => item !== skill) : [...draft.skills, skill]);

  async function requestLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("This device does not provide location permission.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => set("location_permission_granted", true),
      () => toast.error("Location permission is required to receive nearby requests."),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  async function submit() {
    if (!draft.full_name.trim() || !draft.area_of_operation.trim() || !draft.safety_acknowledged || !draft.location_permission_granted || !draft.emergency_permissions) {
      toast.error("Complete the safety, location, and permission steps before activating.");
      return;
    }
    setSaving(true);
    const { data, error } = await db.from("community_responders").insert({
      user_id: userId,
      full_name: draft.full_name.trim(),
      phone: draft.phone.trim() || null,
      preferred_language: draft.preferred_language,
      area_of_operation: draft.area_of_operation.trim(),
      responder_type: draft.responder_type,
      service_radius_m: draft.service_radius_m,
      emergency_permissions: true,
      opted_in: true,
      location_permission_granted: true,
      safety_acknowledged: true,
      availability_status: "offline",
    }).select("id").single();
    if (error || !data) {
      toast.error(error?.message ?? "Could not create your responder profile.");
      setSaving(false);
      return;
    }
    if (draft.skills.length) {
      const { error: skillsError } = await db.from("responder_skills").insert(draft.skills.map((skill) => ({ responder_id: data.id, skill })));
      if (skillsError) toast.error("Profile created, but skills could not be saved.");
    }
    toast.success("Your responder profile is ready. You start offline for safety.");
    await onComplete();
  }

  const steps = [
    {
      eyebrow: "A safer way to help",
      title: "I want to help my community.",
      body: "Allma can send you carefully selected emergency requests from people near you. Only accept when you are able and it is safe.",
      content: (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: HeartHandshake, title: "Opt in", body: "You choose when Allma may contact you." },
            { icon: MapPin, title: "Approximate only", body: "Your exact location is never public." },
            { icon: ShieldCheck, title: "Official help first", body: "Community support never replaces emergency services." },
          ].map(({ icon: Icon, title, body }) => <InfoTile key={title} icon={Icon} title={title} body={body} />)}
        </div>
      ),
    },
    {
      eyebrow: "Your responder profile",
      title: "Tell Allma how you can help.",
      body: "Professional or authority titles stay verification-required until an administrator confirms them.",
      content: (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><input value={draft.full_name} onChange={(event) => set("full_name", event.target.value)} placeholder="Your name" /></Field>
          <Field label="Phone number (verification pending)"><input value={draft.phone} onChange={(event) => set("phone", event.target.value)} placeholder="+256 ..." /></Field>
          <Field label="Preferred language"><input value={draft.preferred_language} onChange={(event) => set("preferred_language", event.target.value)} /></Field>
          <Field label="Area of operation"><input value={draft.area_of_operation} onChange={(event) => set("area_of_operation", event.target.value)} placeholder="Town, district, or community" /></Field>
          <Field label="Responder type" className="sm:col-span-2">
            <select value={draft.responder_type} onChange={(event) => set("responder_type", event.target.value)}>{RESPONDER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}{type.professional ? " — verification required" : ""}</option>)}</select>
          </Field>
          {responderType?.professional && <p className="sm:col-span-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-[12px] text-amber-700 dark:text-amber-200"><AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" /> This is recorded as <strong>{responderType.label} — verification required</strong>. Allma will not display it as an official qualification until verified.</p>}
          <div className="sm:col-span-2"><p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Emergency skills</p><div className="flex flex-wrap gap-2">{RESPONDER_SKILLS.map((skill) => <button type="button" key={skill} onClick={() => toggleSkill(skill)} className={cn("rounded-full border px-3 py-2 text-[12px] font-semibold transition", draft.skills.includes(skill) ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:bg-accent")}>{draft.skills.includes(skill) && <Check className="mr-1 inline h-3 w-3" />}{skill}</button>)}</div></div>
        </div>
      ),
    },
    {
      eyebrow: "Service area",
      title: "Choose when and how far you can respond.",
      body: "Requests outside this radius will not be sent unless you explicitly change it.",
      content: (
        <div className="space-y-5">
          <div><p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Preferred response radius</p><div className="grid grid-cols-5 gap-2">{SERVICE_RADII.map((radius) => <button type="button" key={radius.value} onClick={() => set("service_radius_m", radius.value)} className={cn("rounded-xl border px-2 py-3 text-[12px] font-bold", draft.service_radius_m === radius.value ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground")}>{radius.label}</button>)}</div></div>
          <button type="button" onClick={() => void requestLocation()} className={cn("flex w-full items-center gap-3 rounded-2xl border p-4 text-left", draft.location_permission_granted ? "border-emerald-500/30 bg-emerald-500/10" : "border-border/70 bg-card/60")}>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10"><MapPin className="h-5 w-5 text-primary" /></span><span className="flex-1"><strong className="block text-[13px]">{draft.location_permission_granted ? "Location permission granted" : "Allow location for matching"}</strong><span className="text-[11.5px] text-muted-foreground">Used securely to calculate proximity. Exact coordinates are not shown to other responders.</span></span>{draft.location_permission_granted ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <ArrowRight className="h-4 w-4 text-muted-foreground" />}</button>
        </div>
      ),
    },
    {
      eyebrow: "Safety agreement",
      title: "Only respond when it is safe.",
      body: "You are supplementary community assistance, not a replacement for police, ambulance, or fire services.",
      content: (
        <div className="space-y-3">
          <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-[12px] leading-relaxed"><p className="font-bold text-destructive">Never:</p><ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground"><li>Confront armed suspects or chase criminals</li><li>Enter fires or dangerous buildings</li><li>Provide professional treatment unless qualified</li><li>Put yourself or others in danger</li></ul><p className="mt-3 font-semibold text-foreground">When in doubt, stay safe and wait for official emergency services.</p></div>
          <label className="flex items-start gap-3 rounded-2xl border border-border/70 p-4 text-[12px]"><input type="checkbox" checked={draft.safety_acknowledged} onChange={(event) => set("safety_acknowledged", event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" /><span>I understand the safety rules and will only respond when I can do so safely.</span></label>
          <label className="flex items-start gap-3 rounded-2xl border border-border/70 p-4 text-[12px]"><input type="checkbox" checked={draft.emergency_permissions} onChange={(event) => set("emergency_permissions", event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" /><span>I explicitly opt in to receive selected emergency assistance requests. I can go offline at any time.</span></label>
        </div>
      ),
    },
  ];
  const current = steps[step];

  return <div className="mx-auto w-full max-w-4xl px-5 pb-10 pt-8 lg:px-10"><div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card/80 p-6 shadow-lift sm:p-10"><div className="hero-glow pointer-events-none absolute inset-0 opacity-40" /><div className="relative"><div className="mb-8 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{current.eyebrow}</p><p className="mt-2 text-[11px] text-muted-foreground">Step {step + 1} of {steps.length}</p></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10"><Users className="h-5 w-5 text-primary" /></span></div><div className="mb-8"><h1 className="font-display text-3xl font-black tracking-[-0.04em] sm:text-4xl">{current.title}</h1><p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{current.body}</p></div>{current.content}<div className="mt-8 flex justify-between gap-3"><Button variant="ghost" className="rounded-full" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>Back</Button>{step < steps.length - 1 ? <Button className="rounded-full px-6" onClick={() => setStep((value) => value + 1)}>Continue <ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button className="rounded-full bg-emerald-600 px-6 text-white hover:bg-emerald-700" disabled={saving} onClick={() => void submit()}>{saving ? "Saving..." : "Create responder profile"} <ShieldCheck className="ml-2 h-4 w-4" /></Button>}</div></div></div></div>;
}

function ResponderDashboard({ profile, notifications, assignments, showDemo, onDemoChange, onReload }: { profile: Profile; notifications: Notification[]; assignments: Assignment[]; showDemo: boolean; onDemoChange: (value: boolean) => void; onReload: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [demoStatus, setDemoStatus] = useState<ResponderStatus>("assigned");
  const [availabilityWindow, setAvailabilityWindow] = useState<"30m" | "1h" | "always">("1h");
  const pending = notifications.filter((notification) => ["pending", "sent", "delivered", "viewed"].includes(notification.notification_status));
  const active = assignments[0];
  const freshness = locationFreshness(profile.updated_at);
  const typeLabel = RESPONDER_TYPES.find((type) => type.value === profile.responder_type)?.label ?? "Community responder";
  const availability = AVAILABILITY_OPTIONS.find((option) => option.value === profile.availability_status) ?? AVAILABILITY_OPTIONS[3];

  async function setAvailability(value: ResponderAvailability) {
    setSaving(true);
    const duration = availabilityWindow === "30m" ? 30 * 60 * 1000 : availabilityWindow === "1h" ? 60 * 60 * 1000 : null;
    const { error } = await db.from("community_responders").update({ availability_status: value, availability_until: value === "available" && duration ? new Date(Date.now() + duration).toISOString() : null, updated_at: new Date().toISOString() }).eq("id", profile.id);
    if (error) toast.error(error.message); else { toast.success(`${value === "available" ? "You are now available" : "Availability updated"}.`); await onReload(); }
    setSaving(false);
  }

  async function respondToNotification(id: string, accept: boolean, reason?: string) {
    setSaving(true);
    const { error } = await db.rpc("respond_to_responder_notification", { p_notification_id: id, p_accept: accept, p_reason: reason ?? null });
    if (error) toast.error(error.message);
    else { toast.success(accept ? "Emergency accepted. Stay safe while responding." : "Request declined."); await onReload(); }
    setSaving(false);
  }

  async function updateAssignment(id: string, next: ResponderStatus, reason?: string) {
    setSaving(true);
    const { error } = await db.rpc("update_responder_assignment", { p_assignment_id: id, p_next_status: next, p_reason: reason ?? null });
    if (error) toast.error(error.message); else { toast.success(next === "need_official_help" ? "Official assistance requested." : "Emergency status updated."); await onReload(); }
    setSaving(false);
  }

  return <div className="mx-auto w-full max-w-6xl px-5 pb-10 pt-6 lg:px-10 lg:pt-8"><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Community responder network</p><h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em]">Good evening, {profile.full_name.split(" ")[0]}</h1><p className="mt-1.5 text-[13px] text-muted-foreground">Supplementary help, coordinated safely.</p></div><div className="flex flex-wrap items-center justify-end gap-2"><select aria-label="Availability window" value={availabilityWindow} disabled={saving} onChange={(event) => setAvailabilityWindow(event.target.value as typeof availabilityWindow)} className="rounded-full border border-border/60 bg-card/70 px-3 py-2 text-[11px] text-muted-foreground outline-none"><option value="30m">Available for 30 minutes</option><option value="1h">Available for 1 hour</option><option value="always">Always available</option></select><div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-2"><span className={cn("h-2.5 w-2.5 rounded-full", availability.dot)} /><span className="text-[12px] font-bold">{availability.label}</span><select aria-label="Responder availability" value={profile.availability_status} disabled={saving} onChange={(event) => void setAvailability(event.target.value as ResponderAvailability)} className="max-w-[110px] bg-transparent text-[11px] text-muted-foreground outline-none"><option value="available">Available</option><option value="busy">Busy</option><option value="handling_emergency">Handling emergency</option><option value="offline">Offline</option></select></div></div></div><div className="mb-6 grid gap-4 sm:grid-cols-3"><Metric icon={Bell} label="Requests needing response" value={pending.length} tone="text-primary" /><Metric icon={Compass} label="Response area" value={profile.service_radius_m >= 1000 ? `${profile.service_radius_m / 1000} km` : `${profile.service_radius_m} m`} tone="text-gold" /><Metric icon={BadgeCheck} label="Verification" value={profile.verification_status === "unverified" ? "Unverified" : "Verified"} tone="text-emerald-500" /></div><div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]"><div className="space-y-5">{active && <ActiveResponse assignment={active} saving={saving} onUpdate={updateAssignment} />}{pending.length > 0 ? <div><SectionHeading icon={Bell} title="Emergency requests" count={pending.length} /><div className="space-y-3">{pending.map((notification) => <NotificationCard key={notification.id} notification={notification} saving={saving} onRespond={respondToNotification} />)}</div></div> : <EmptyRequests />}{showDemo && <DemoRequest status={demoStatus} onStatus={setDemoStatus} />}</div><div className="space-y-5"><div className="rounded-[1.5rem] border border-border/60 bg-card/75 p-5 shadow-soft"><SectionHeading icon={UserRound} title="Your responder profile" /><div className="mt-4 space-y-3 text-[12px]"><div className="flex items-center justify-between"><span className="text-muted-foreground">Type</span><span className="font-semibold text-right">{typeLabel}{RESPONDER_TYPES.find((type) => type.value === profile.responder_type)?.professional ? " · verification required" : ""}</span></div><div className="flex items-center justify-between"><span className="text-muted-foreground">Verification</span><span className="font-semibold">{VERIFICATION_COPY[profile.verification_status] ?? "Pending review"}</span></div><div className="flex items-center justify-between"><span className="text-muted-foreground">Area</span><span className="font-semibold text-right">{profile.area_of_operation || "Not set"}</span></div><div className="flex items-center justify-between"><span className="text-muted-foreground">Location</span><span className={cn("font-semibold", freshness.tone)}>{profile.location_permission_granted ? "Permission on" : "Unavailable"}</span></div></div><div className="mt-4 rounded-xl bg-muted/60 p-3 text-[11px] leading-relaxed text-muted-foreground"><MapPin className="mr-1 inline h-3 w-3" /> Location is used for secure matching only. Other responders never see your exact position.</div></div><div className="rounded-[1.5rem] border border-border/60 bg-card/75 p-5 shadow-soft"><SectionHeading icon={ShieldCheck} title="Safety status" /><p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">Stay at a safe distance from armed attacks, active violence, fires, and dangerous crime. Official emergency services come first.</p><a href="tel:999" className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-border/70 py-2.5 text-[12px] font-bold hover:bg-accent"><PhoneCall className="h-3.5 w-3.5" /> Official emergency help</a></div><label className="flex items-center justify-between rounded-[1.5rem] border border-dashed border-border/70 bg-card/40 p-5"><span><span className="block text-[12px] font-bold">DEMO MODE</span><span className="mt-1 block text-[11px] text-muted-foreground">Simulated requests only. Never real.</span></span><Switch checked={showDemo} onCheckedChange={onDemoChange} /></label></div></div></div>;
}

function ActiveResponse({ assignment, saving, onUpdate }: { assignment: Assignment; saving: boolean; onUpdate: (id: string, next: ResponderStatus, reason?: string) => Promise<void> }) {
  const next: Partial<Record<ResponderStatus, { label: string; icon: typeof Navigation; status: ResponderStatus }>> = { accepted: { label: "Mark on the way", icon: Navigation, status: "en_route" }, en_route: { label: "I've arrived", icon: CheckCircle2, status: "arrived" }, arrived: { label: "Start assisting", icon: HeartHandshake, status: "assisting" }, assisting: { label: "Assistance complete", icon: Check, status: "completed" } };
  const action = next[assignment.status];
  return <div className="overflow-hidden rounded-[1.7rem] border border-primary/30 bg-primary/[0.06] shadow-soft"><div className="flex items-center justify-between border-b border-primary/15 px-5 py-3"><span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary"><span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> Active response</span><span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold capitalize text-primary">{assignment.status.replace(/_/g, " ")}</span></div><div className="p-5"><h2 className="font-display text-xl font-black">Emergency assistance</h2><p className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {formatApproximateDistance(assignment.distance)} · area details shared after authorization</p><div className="mt-5 grid gap-2 sm:grid-cols-2"><a href="tel:999" className="flex items-center justify-center gap-2 rounded-xl border border-border/70 py-2.5 text-[12px] font-bold hover:bg-accent"><PhoneCall className="h-3.5 w-3.5" /> Call through Allma</a><button type="button" onClick={() => toast.info("Navigation opens after an authorized emergency location is available.")} className="flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-[12px] font-bold text-primary-foreground"><Navigation className="h-3.5 w-3.5" /> Navigate</button></div>{action && <button type="button" disabled={saving} onClick={() => void onUpdate(assignment.id, action.status)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-[12px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><action.icon className="h-3.5 w-3.5" /> {action.label}</button>}<button type="button" disabled={saving} onClick={() => void onUpdate(assignment.id, "need_official_help", "Responder requested official assistance")} className="mt-2 w-full rounded-xl border border-destructive/25 py-2 text-[11px] font-bold text-destructive hover:bg-destructive/5">Need official help</button></div></div>;
}

function NotificationCard({ notification, saving, onRespond }: { notification: Notification; saving: boolean; onRespond: (id: string, accept: boolean, reason?: string) => Promise<void> }) {
  const dangerous = isDangerousIncident(notification.emergency_category);
  return <article className="rounded-[1.5rem] border border-border/60 bg-card/80 p-5 shadow-soft"><div className="flex items-start gap-3"><span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", dangerous ? "bg-destructive/10" : "bg-primary/10")}><Bell className={cn("h-4 w-4", dangerous ? "text-destructive" : "text-primary")} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-[14px] font-bold capitalize">{notification.emergency_category.replace(/_/g, " ")} nearby</h2><span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase text-amber-600">{notification.severity}</span></div><p className="mt-1.5 text-[12px] text-muted-foreground">{formatApproximateDistance(notification.approximate_distance_m)} · {notification.area ?? "General area"}</p>{notification.minimal_summary && <p className="mt-3 rounded-xl bg-muted/60 p-3 text-[12px] leading-relaxed text-muted-foreground">{notification.minimal_summary}</p>}{dangerous && <p className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-[12px] font-semibold leading-relaxed text-destructive">Do not approach the scene. Stay at a safe distance and wait for authorized emergency services.</p>}</div></div><div className="mt-4 flex gap-2"><button type="button" disabled={saving} onClick={() => void onRespond(notification.id, false, dangerous ? "Dangerous incident — staying at a safe distance" : "Unavailable")} className="flex-1 rounded-xl border border-border/70 py-2.5 text-[12px] font-bold text-muted-foreground hover:bg-accent disabled:opacity-50"><X className="mr-1 inline h-3.5 w-3.5" /> {dangerous ? "Stay safe" : "Decline"}</button>{dangerous ? <a href="tel:999" className="flex flex-1 items-center justify-center rounded-xl bg-destructive py-2.5 text-[12px] font-bold text-white">Official help</a> : <button type="button" disabled={saving} onClick={() => void onRespond(notification.id, true)} className="flex-1 rounded-xl bg-primary py-2.5 text-[12px] font-bold text-primary-foreground disabled:opacity-50"><Check className="mr-1 inline h-3.5 w-3.5" /> Accept</button>}</div></article>;
}

function DemoRequest({ status, onStatus }: { status: ResponderStatus; onStatus: (status: ResponderStatus) => void }) {
  const flow: ResponderStatus[] = ["assigned", "accepted", "en_route", "arrived", "assisting", "completed"];
  const index = flow.indexOf(status);
  return <div className="rounded-[1.5rem] border-2 border-dashed border-gold/50 bg-gold/[0.06] p-5"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-gold"><Sparkles className="h-3.5 w-3.5" /> DEMO ONLY · simulated response</div><h2 className="mt-3 text-[14px] font-bold">Medical emergency · approximately 650m away</h2><p className="mt-1 text-[11.5px] text-muted-foreground">This is not a real emergency and no person will be contacted.</p><div className="mt-4 flex flex-wrap gap-1.5">{flow.map((item, itemIndex) => <button type="button" key={item} onClick={() => onStatus(item)} className={cn("rounded-full px-2.5 py-1.5 text-[10px] font-bold capitalize", itemIndex <= index ? "bg-gold text-gold-foreground" : "bg-muted text-muted-foreground")}>{item.replace(/_/g, " ")}</button>)}</div></div>;
}

function LoadingState() { return <div className="mx-auto max-w-6xl px-5 py-12"><div className="h-48 animate-pulse rounded-[2rem] bg-muted" /></div>; }
function EmptyRequests() { return <div className="rounded-[1.7rem] border border-dashed border-border/70 bg-card/40 p-10 text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500/60" /><h2 className="mt-3 text-[14px] font-bold">No requests right now</h2><p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-relaxed text-muted-foreground">You are opted in, but Allma only sends requests that match your area, availability, permissions, and current safety conditions.</p></div>; }
function Metric({ icon: Icon, label, value, tone }: { icon: typeof Bell; label: string; value: string | number; tone: string }) { return <div className="rounded-[1.4rem] border border-border/60 bg-card/75 p-4 shadow-soft"><Icon className={cn("h-4 w-4", tone)} /><p className={cn("mt-3 font-display text-2xl font-black", tone)}>{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>; }
function SectionHeading({ icon: Icon, title, count }: { icon: typeof Bell; title: string; count?: number }) { return <div className="mb-3 flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /><h2 className="text-[12px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{title}</h2>{count != null && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{count}</span>}</div>; }
function InfoTile({ icon: Icon, title, body }: { icon: typeof Bell; title: string; body: string }) { return <div className="rounded-2xl border border-border/60 bg-background/40 p-4"><Icon className="h-5 w-5 text-primary" /><p className="mt-3 text-[13px] font-bold">{title}</p><p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{body}</p></div>; }
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) { return <label className={cn("block", className)}><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>{children}</label>; }