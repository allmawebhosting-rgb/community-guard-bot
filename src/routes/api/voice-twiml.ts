import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function xml(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/xml; charset=utf-8" } });
}

function identityFor(userId: string) {
  return `allma_${userId}`;
}

export const Route = createFileRoute("/api/voice-twiml")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const signature = request.headers.get("x-twilio-signature");
        if (!authToken || !signature) return xml("<Response><Reject/></Response>", 401);
        const form = await request.formData();
        const params = Object.fromEntries(form.entries()) as Record<string, string>;
        if (!twilio.validateRequest(authToken, signature, request.url, params)) {
          return xml("<Response><Reject/></Response>", 403);
        }

        const callId = params.callId;
        if (!callId) return xml("<Response><Reject/></Response>", 400);
        const admin = adminClient();
        const { data: call } = await admin
          .from("emergency_calls")
          .select("id, caller_id, recipient_id, status")
          .eq("id", callId)
          .maybeSingle();
        if (!call || ["ended", "declined", "missed", "failed"].includes(call.status)) {
          return xml("<Response><Reject/></Response>", 403);
        }

        const callerIdentity = identityFor(call.caller_id);
        const recipientIdentity = identityFor(call.recipient_id);
        const { data: config } = await admin
          .from("voice_configuration")
          .select("responder_timeout_seconds")
          .eq("id", true)
          .maybeSingle();
        const timeout = Math.min(120, Math.max(10, config?.responder_timeout_seconds ?? 20));
        const statusUrl = new URL(`/api/voice-status?callId=${encodeURIComponent(callId)}`, request.url).toString();
        await admin
          .from("emergency_calls")
          .update({
            twilio_call_sid: params.CallSid ?? null,
            twilio_from_identity: callerIdentity,
            twilio_to_identity: recipientIdentity,
            status: "ringing",
            ringing_at: new Date().toISOString(),
            provider_mode: "twilio",
            provider_confirmed: false,
          })
          .eq("id", callId);

        const response = new twilio.twiml.VoiceResponse();
        const dial = response.dial({
          answerOnBridge: true,
          callerId: `client:${callerIdentity}`,
          timeout,
          action: statusUrl,
          method: "POST",
          statusCallback: statusUrl,
          statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
          statusCallbackMethod: "POST",
        });
        const client = dial.client(recipientIdentity);
        client.parameter({ name: "callId", value: callId });
        client.parameter({ name: "callerIdentity", value: callerIdentity });
        return xml(response.toString());
      },
    },
  },
});
