import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bell, CalendarDays, Check, ChevronRight, Clock3, LockKeyhole, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/allma/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { REMINDER_OPTIONS, REMINDER_TYPES, formatReminderDate, nextDeliveryAt, type HealthReminder, type Recurrence, type ReminderStatus, type ReminderType } from "@/lib/health-reminders";

export const Route = createFileRoute("/_authenticated/health-reminders")({
  head: () => ({ meta: [{ title: "Health & Reminders — Allma Safety AI" }] }),
  component: HealthRemindersPage,
});

type ReminderClient = { from: (table: string) => any };
const db = supabase as unknown as ReminderClient;

function HealthRemindersPage() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<HealthReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<HealthReminder | "new" | null>(null);
  const [settings, setSettings] = useState({ notifications_enabled: true, calls_enabled: false, do_not_disturb: false, opted_in: true });

  async function load() {
    setLoading(true);
    const { data, error } = await db.from("health_reminders").select("*").order("appointment_date").order("appointment_time");
    if (error) toast.error("Health reminders are not available right now.");
    setReminders((data ?? []) as HealthReminder[]);
    const { data: savedSettings } = await db.from("health_reminder_settings").select("notifications_enabled,calls_enabled,do_not_disturb,opted_in").maybeSingle();
    if (savedSettings) setSettings(savedSettings);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const active = reminders.filter((item) => !["COMPLETED", "CANCELLED"].includes(item.status));
  const history = reminders.filter((item) => ["COMPLETED", "CANCELLED", "MISSED"].includes(item.status));
  const next = active[0];

  async function save(values: Record<string, unknown>, id?: string) {
    const query = id ? db.from("health_reminders").update(values).eq("id", id) : db.from("health_reminders").insert({ ...values, user_id: user?.id });
    const { error } = await query;
    if (error) { toast.error("Could not save this reminder."); return; }
    toast.success(id ? "Reminder updated." : "Health reminder scheduled.");
    setEditing(null);
    await load();
  }

  async function updateStatus(id: string, status: ReminderStatus) {
    const { error } = await db.from("health_reminders").update({ status }).eq("id", id);
    if (error) toast.error("Could not update this reminder."); else await load();
  }

  async function remove(id: string) {
    const { error } = await db.from("health_reminders").delete().eq("id", id);
    if (error) toast.error("Could not remove this reminder."); else { toast.success("Reminder removed."); await load(); }
  }

  async function updateSettings(next: typeof settings) {
    setSettings(next);
    if (!user) return;
    const { error } = await db.from("health_reminder_settings").upsert({ ...next, user_id: user.id });
    if (error) toast.error("Could not save reminder settings.");
  }

  async function deleteAll() {
    const { error } = await db.from("health_reminders").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) toast.error("Could not delete health reminders."); else { toast.success("Health reminder information deleted."); await load(); }
  }

  return (
    <AppShell title="Health & Reminders">
      <main className="mx-auto w-full max-w-5xl px-5 pb-10 pt-6 lg:px-10 lg:pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Private by default</p><h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em]">Health & Reminders</h1><p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">A calm place to keep appointments, routines, and follow-ups on your schedule. Allma does not diagnose or share this information.</p></div>
          <Button onClick={() => setEditing("new")} className="rounded-xl"><Plus className="mr-2 h-4 w-4" /> New reminder</Button>
        </div>

        <div className="mt-8 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-3 text-[12px] text-muted-foreground"><LockKeyhole className="h-4 w-4 shrink-0 text-primary" /> Your health reminder details are private and are not included in SOS or Safety Network information.</div>

        {loading ? <div className="mt-8 h-40 animate-pulse rounded-2xl bg-muted" /> : <>
          {next && <section className="mt-8"><SectionLabel>Next reminder</SectionLabel><ReminderRow reminder={next} featured onEdit={() => setEditing(next)} onComplete={() => void updateStatus(next.id, "COMPLETED")} onRemove={() => void remove(next.id)} /></section>}
          <section className="mt-8"><SectionLabel>Upcoming</SectionLabel>{active.length > (next ? 1 : 0) ? <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card/60">{active.slice(next ? 1 : 0).map((item) => <ReminderRow key={item.id} reminder={item} onEdit={() => setEditing(item)} onComplete={() => void updateStatus(item.id, "COMPLETED")} onRemove={() => void remove(item.id)} />)}</div> : <EmptyState onNew={() => setEditing("new")} />}</section>
          {history.length > 0 && <section className="mt-8"><SectionLabel>History</SectionLabel><div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card/50">{history.map((item) => <ReminderRow key={item.id} reminder={item} onEdit={() => setEditing(item)} onComplete={item.status === "MISSED" ? () => void updateStatus(item.id, "COMPLETED") : undefined} onRemove={() => void remove(item.id)} />)}</div></section>}
          <section className="mt-8"><SectionLabel>Health Reminder Settings</SectionLabel><div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card/60"><SettingRow label="Notifications" description="Show private app reminders" checked={settings.notifications_enabled} onChange={(value) => void updateSettings({ ...settings, notifications_enabled: value })} /><SettingRow label="Reminder calls" description="Off by default. Uses a separate reminder service." checked={settings.calls_enabled} onChange={(value) => void updateSettings({ ...settings, calls_enabled: value })} /><SettingRow label="Do Not Disturb" description="Pause delivery while enabled" checked={settings.do_not_disturb} onChange={(value) => void updateSettings({ ...settings, do_not_disturb: value })} /><SettingRow label="Health reminders" description="Turn off all reminder delivery" checked={settings.opted_in} onChange={(value) => void updateSettings({ ...settings, opted_in: value })} /><button type="button" onClick={() => void deleteAll()} className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-[12px] font-bold text-destructive hover:bg-destructive/5"><Trash2 className="h-4 w-4" /> Delete all Health Reminder information</button></div></section>
        </>}
      </main>
      {editing && <ReminderEditor reminder={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={save} />}
    </AppShell>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) { return <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">{children}</p>; }
function EmptyState({ onNew }: { onNew: () => void }) { return <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 px-5 py-10 text-center"><CalendarDays className="mx-auto h-8 w-8 text-primary/60" /><p className="mt-3 text-[14px] font-semibold">Nothing scheduled yet</p><p className="mt-1 text-[12px] text-muted-foreground">Keep an appointment or routine close at hand.</p><button type="button" onClick={onNew} className="mt-4 text-[12px] font-bold text-primary">Add your first reminder <ChevronRight className="ml-1 inline h-3.5 w-3.5" /></button></div>; }

function ReminderRow({ reminder, featured, onEdit, onComplete, onRemove }: { reminder: HealthReminder; featured?: boolean; onEdit: () => void; onComplete?: () => void; onRemove: () => void }) {
  const type = REMINDER_TYPES.find((item) => item.value === reminder.reminder_type)?.label ?? "Health reminder";
  const recurrence = reminder.recurrence?.type && reminder.recurrence.type !== "none" ? ` · Every ${reminder.recurrence.type}` : "";
  return <article className={cn("flex flex-wrap items-center gap-4 p-4 sm:px-5", featured && "rounded-2xl border border-primary/25 bg-primary/[0.055] p-5 shadow-soft")}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10"><Bell className="h-4 w-4 text-primary" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-[13.5px] font-bold">{reminder.title || type}</p>{reminder.status !== "SCHEDULED" && <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{reminder.status}</span>}</div><p className="mt-1 text-[12px] text-muted-foreground">{formatReminderDate(reminder)}{recurrence}</p>{reminder.facility_optional && <p className="mt-1 text-[12px] text-muted-foreground">{reminder.facility_optional}</p>}{reminder.status === "MISSED" && <p className="mt-2 text-[11px] font-semibold text-amber-600 dark:text-amber-300">Did you attend your appointment?</p>}</div><div className="flex flex-wrap items-center justify-end gap-2">{reminder.status === "MISSED" && <><button type="button" onClick={onComplete} className="min-h-9 rounded-lg border border-border/70 px-3 text-[11px] font-bold hover:bg-accent">Yes</button><button type="button" onClick={() => void onEdit()} className="min-h-9 rounded-lg border border-border/70 px-3 text-[11px] font-bold hover:bg-accent">Reschedule</button></>}{reminder.status !== "MISSED" && <button type="button" onClick={onEdit} className="min-h-9 rounded-lg px-3 text-[11px] font-bold text-primary hover:bg-primary/10">Edit</button>}{onComplete && reminder.status === "SCHEDULED" && <button type="button" onClick={onComplete} className="min-h-9 rounded-lg border border-border/70 px-3 text-[11px] font-bold hover:bg-accent"><Check className="mr-1 inline h-3.5 w-3.5" /> Complete</button>}<button type="button" onClick={onRemove} aria-label={`Remove ${reminder.title}`} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></div></article>;
}

function SettingRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) { return <div className="flex items-center gap-4 px-4 py-4"><div className="min-w-0 flex-1"><p className="text-[13px] font-semibold">{label}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p></div><Switch checked={checked} onCheckedChange={onChange} /></div>; }

function ReminderEditor({ reminder, onClose, onSave }: { reminder: HealthReminder | null; onClose: () => void; onSave: (values: Record<string, unknown>, id?: string) => Promise<void> }) {
  const [type, setType] = useState<ReminderType>(reminder?.reminder_type ?? "doctor_visit");
  const [title, setTitle] = useState(reminder?.title ?? "");
  const [context, setContext] = useState(reminder?.health_context_optional ?? "");
  const [preferNot, setPreferNot] = useState(false);
  const [date, setDate] = useState(reminder?.appointment_date ?? "");
  const [time, setTime] = useState(reminder?.appointment_time?.slice(0, 5) ?? "");
  const [facility, setFacility] = useState(reminder?.facility_optional ?? "");
  const [notes, setNotes] = useState(reminder?.notes_optional ?? "");
  const [schedules, setSchedules] = useState<string[]>(reminder?.reminder_schedule ?? ["1_day_before"]);
  const [custom, setCustom] = useState(false);
  const [notification, setNotification] = useState(reminder?.notification_enabled ?? true);
  const [calls, setCalls] = useState(reminder?.call_enabled ?? false);
  const [callTime, setCallTime] = useState(reminder?.call_time?.slice(0, 5) ?? "08:00");
  const [recurrence, setRecurrence] = useState<Recurrence>(reminder?.recurrence ?? { type: "none" });
  const [saving, setSaving] = useState(false);
  const toggleSchedule = (value: string) => setSchedules((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  async function submit() {
    if (!title.trim() || !date || !time || !schedules.length || (calls && !callTime)) return;
    setSaving(true);
    const delivery = nextDeliveryAt(date, time, schedules);
    await onSave({ reminder_type: type, title: title.trim(), health_context_optional: preferNot ? null : context.trim() || null, appointment_date: date, appointment_time: time, facility_optional: facility.trim() || null, notes_optional: notes.trim() || null, reminder_schedule: custom ? [...schedules, "custom"] : schedules, notification_enabled: notification, call_enabled: calls, call_time: calls ? callTime : null, recurrence, next_delivery_at: delivery.iso, status: "SCHEDULED" }, reminder?.id);
    setSaving(false);
  }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 backdrop-blur-sm sm:items-center"><div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border/70 bg-background p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Health & Reminders</p><h2 className="mt-2 font-display text-2xl font-black">{reminder ? "Edit reminder" : "Set a reminder"}</h2><p className="mt-1 text-[12px] text-muted-foreground">Only add what you want Allma to remember. This is not medical advice.</p></div><button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-accent"><X className="h-4 w-4" /></button></div>
    <div className="mt-7 space-y-6"><div><Label>What should Allma remind you about?</Label><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{REMINDER_TYPES.map((item) => <button type="button" key={item.value} onClick={() => setType(item.value)} className={cn("min-h-11 rounded-xl border px-3 text-left text-[12px] font-semibold", type === item.value ? "border-primary bg-primary/10 text-primary" : "border-border/70 hover:bg-accent")}>{item.label}</button>)}</div></div>
    <div><Label htmlFor="health-title">Reminder title</Label><Input id="health-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Doctor appointment" className="mt-2 h-11 rounded-xl" /></div>
    <div><Label>What is this related to? <span className="font-normal text-muted-foreground">(optional)</span></Label><Input value={context} disabled={preferNot} onChange={(event) => setContext(event.target.value)} placeholder="Enter a condition or health concern" className="mt-2 h-11 rounded-xl" /><label className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground"><input type="checkbox" checked={preferNot} onChange={(event) => setPreferNot(event.target.checked)} /> Prefer not to say</label></div>
    <div className="grid gap-3 sm:grid-cols-2"><div><Label>Date</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-2 h-11 rounded-xl" /></div><div><Label>Time</Label><Input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="mt-2 h-11 rounded-xl" /></div></div>
    <div className="grid gap-3 sm:grid-cols-2"><div><Label>Doctor or facility <span className="font-normal text-muted-foreground">(optional)</span></Label><Input value={facility} onChange={(event) => setFacility(event.target.value)} placeholder="Mulago Hospital" className="mt-2 h-11 rounded-xl" /></div><div><Label>Additional notes <span className="font-normal text-muted-foreground">(optional)</span></Label><Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Follow-up after treatment" className="mt-2 h-11 rounded-xl" /></div></div>
    <div><Label>Remind me</Label><div className="mt-2 grid gap-2 sm:grid-cols-3">{REMINDER_OPTIONS.map((item) => <label key={item.value} className="flex min-h-11 items-center gap-2 rounded-xl border border-border/70 px-3 text-[12px]"><input type="checkbox" checked={schedules.includes(item.value)} onChange={() => toggleSchedule(item.value)} />{item.label}</label>)}</div><label className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-border/70 px-3 text-[12px]"><input type="checkbox" checked={custom} onChange={(event) => setCustom(event.target.checked)} /> Custom reminder</label></div>
    <div className="rounded-2xl border border-border/60 bg-card/50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-[13px] font-semibold">App notification</p><p className="text-[11px] text-muted-foreground">Private notification on your devices.</p></div><Switch checked={notification} onCheckedChange={setNotification} /></div><div className="mt-4 flex items-center justify-between gap-3 border-t border-border/50 pt-4"><div><p className="text-[13px] font-semibold">Phone call reminder</p><p className="text-[11px] text-muted-foreground">Off by default. Calls use a separate reminder service, never SOS.</p></div><Switch checked={calls} onCheckedChange={setCalls} /></div>{calls && <div className="mt-3"><Label>Reminder call time</Label><Input type="time" value={callTime} onChange={(event) => setCallTime(event.target.value)} className="mt-2 h-11 rounded-xl" /><p className="mt-1 text-[11px] text-muted-foreground">Allma will use this time and will not call outside your configured window.</p></div>}</div>
    <div><Label>Repeat</Label><select value={recurrence.type} onChange={(event) => setRecurrence({ type: event.target.value as Recurrence["type"] })} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="none">One time</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="custom">Custom interval</option></select></div></div>
    <div className="mt-7 flex gap-2 border-t border-border/60 pt-5"><Button variant="ghost" onClick={onClose} className="flex-1 rounded-xl">Cancel</Button><Button onClick={() => void submit()} disabled={saving || !title.trim() || !date || !time || !schedules.length} className="flex-1 rounded-xl">{saving ? "Saving..." : "Save reminder"}</Button></div>
  </div></div>;
}
