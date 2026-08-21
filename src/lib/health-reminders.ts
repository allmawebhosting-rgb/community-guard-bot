import { supabase } from "@/integrations/supabase/client";

export type ReminderType =
  | "doctor_visit"
  | "hospital_appointment"
  | "follow_up"
  | "medication"
  | "routine_check"
  | "other";
export type ReminderStatus =
  | "SCHEDULED"
  | "SENT"
  | "ACKNOWLEDGED"
  | "COMPLETED"
  | "RESCHEDULED"
  | "CANCELLED"
  | "MISSED";
export type Recurrence = { type: "none" | "daily" | "weekly" | "monthly" | "custom"; interval?: number };

export type HealthReminder = {
  id: string;
  user_id: string;
  reminder_type: ReminderType;
  title: string;
  health_context_optional: string | null;
  appointment_date: string;
  appointment_time: string;
  timezone: string;
  facility_optional: string | null;
  notes_optional: string | null;
  reminder_schedule: string[];
  notification_enabled: boolean;
  call_enabled: boolean;
  call_time: string | null;
  recurrence: Recurrence;
  status: ReminderStatus;
  next_delivery_at: string | null;
  last_delivered_at: string | null;
  created_at: string;
  updated_at: string;
};

export const REMINDER_TYPES: Array<{ value: ReminderType; label: string }> = [
  { value: "doctor_visit", label: "Doctor visit" },
  { value: "hospital_appointment", label: "Hospital appointment" },
  { value: "follow_up", label: "Follow-up" },
  { value: "medication", label: "Medication" },
  { value: "routine_check", label: "Routine check" },
  { value: "other", label: "Other" },
];

export const REMINDER_OPTIONS = [
  { value: "1_day_before", label: "1 day before" },
  { value: "2_hours_before", label: "2 hours before" },
  { value: "at_time", label: "At appointment time" },
] as const;

export function formatReminderDate(reminder: Pick<HealthReminder, "appointment_date" | "appointment_time">) {
  const date = new Date(`${reminder.appointment_date}T${reminder.appointment_time}`);
  return date.toLocaleString("en-UG", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function nextDeliveryAt(date: string, time: string, schedules: string[], timezone = "Africa/Kampala") {
  const base = new Date(`${date}T${time}`);
  const offsets = schedules.map((schedule) => schedule === "1_day_before" ? 24 * 60 : schedule === "2_hours_before" ? 120 : 0);
  const minutes = Math.min(...offsets);
  return { iso: new Date(base.getTime() - minutes * 60_000).toISOString(), timezone };
}

export async function listHealthReminders() {
  const { data, error } = await supabase.from("health_reminders").select("*").order("appointment_date").order("appointment_time");
  if (error) throw error;
  return (data ?? []) as unknown as HealthReminder[];
}
