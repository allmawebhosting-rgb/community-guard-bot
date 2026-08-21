import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const Route = createFileRoute("/api/health-reminders-deliver")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.HEALTH_REMINDER_CRON_SECRET;
        if (!secret || request.headers.get("x-health-reminder-secret") !== secret) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const admin = adminClient();
        const today = new Date().toISOString().slice(0, 10);
        await admin.from("health_reminders").update({ status: "MISSED" }).eq("status", "SCHEDULED").lt("appointment_date", today);
        const { data: due, error } = await admin.rpc("claim_due_health_reminders", { p_limit: 100 });
        if (error) return Response.json({ error: "Could not claim reminders" }, { status: 500 });
        const reminders = (due ?? []) as Array<Record<string, any>>;
        let sent = 0;
        for (const reminder of reminders) {
          const { data: settings } = await admin.from("health_reminder_settings").select("notifications_enabled,do_not_disturb,opted_in").eq("user_id", reminder.user_id).maybeSingle();
          if (settings?.opted_in === false || settings?.notifications_enabled === false || settings?.do_not_disturb === true) continue;
          const facility = reminder.facility_optional ? `\n\n${reminder.facility_optional}` : "";
          const { error: notificationError } = await admin.from("notifications").insert({
            user_id: reminder.user_id,
            title: "ALLMA HEALTH REMINDER",
            body: `You have ${reminder.title.toLowerCase()} on ${reminder.appointment_date} at ${String(reminder.appointment_time).slice(0, 5)}.${facility}`,
            kind: "health_reminder",
            link: "/health-reminders",
          });
          if (!notificationError) sent += 1;
        }
        return Response.json({ claimed: reminders.length, sent });
      },
    },
  },
});
