import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { loadTwilio } from "@/lib/twilio.server";

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const mapStatus: Record<string, string> = {
  initiated: "calling",
  ringing: "ringing",
  answered: "connected",
  "in-progress": "connected",
  completed: "ended",
  busy: "busy",
  failed: "failed",
  "no-answer": "missed",
  canceled: "ended",
};

function xml(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/xml; charset=utf-8" } });
}

export const Route = createFileRoute("/api/voice-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const signature = request.headers.get("x-twilio-signature");
        if (!authToken || !signature) return xml("<Response><Reject/></Response>", 401);
        const twilio = await loadTwilio();
        const form = await request.formData();
        const params = Object.fromEntries(form.entries()) as Record<string, string>;
        if (!twilio.validateRequest(authToken, signature, request.url, params)) {
          return xml("<Response><Reject/></Response>", 403);
        }

        const callId = params.callId ?? new URL(request.url).searchParams.get("callId");
        const providerStatus = params.DialCallStatus ?? params.CallStatus ?? "";
        const status = mapStatus[providerStatus];
        if (!callId || !status) return xml("<Response/>");
        const admin = adminClient();
        const now = new Date().toISOString();
        const update: Record<string, string | number | boolean | null> = {
          status,
          updated_at: now,
          provider_mode: "twilio",
          provider_confirmed: status === "connected",
        };
        if (status === "connected") {
          update.connected_at = now;
          update.accepted_at = now;
        }
        if (["ended", "busy", "failed", "missed"].includes(status)) {
          update.ended_at = now;
          const duration = params.DialCallDuration ?? params.CallDuration;
          if (duration) update.duration = Number.parseInt(duration, 10) || 0;
          if (status === "failed") update.failure_reason = params.ErrorMessage ?? "Twilio reported a failed call.";
        }
        await admin.from("emergency_calls").update(update).eq("id", callId);
        return xml("<Response/>");
      },
    },
  },
});
