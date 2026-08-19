import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { loadTwilio } from "@/lib/twilio.server";

type TokenBody = { callId?: string };

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function identityFor(userId: string) {
  return `allma_${userId}`;
}

function createAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server-side call state storage is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function authenticate(request: Request) {
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!accessToken || !url || !key) return null;
  const userSupabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userSupabase.auth.getUser();
  return error || !data.user ? null : data.user;
}

export const Route = createFileRoute("/api/voice-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await authenticate(request);
        if (!user) return jsonError("Authentication is required.", 401);

        let body: TokenBody = {};
        try {
          body = (await request.json()) as TokenBody;
        } catch {
          // Device registration does not require a call id.
        }
        if (body.callId && !/^[0-9a-f-]{36}$/i.test(body.callId)) {
          return jsonError("That call is not valid.", 400);
        }

        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const apiKey = process.env.TWILIO_API_KEY;
        const apiSecret = process.env.TWILIO_API_SECRET;
        const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;
        if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
          return jsonError("Twilio Voice is not configured on the server.", 503);
        }
        const twilio = await loadTwilio();
        const AccessToken = twilio.jwt.AccessToken;
        const VoiceGrant = AccessToken.VoiceGrant;

        const admin = createAdmin();
        let recipientIdentity: string | null = null;
        if (body.callId) {
          const { data: call, error } = await admin
            .from("emergency_calls")
            .select("caller_id, recipient_id, status")
            .eq("id", body.callId)
            .maybeSingle();
          if (error || !call || (call.caller_id !== user.id && call.recipient_id !== user.id)) {
            return jsonError("You cannot call this person.", 403);
          }
          if (["ended", "declined", "missed", "failed"].includes(call.status)) {
            return jsonError("This call is no longer available.", 409);
          }
          const recipientId = call.caller_id === user.id ? call.recipient_id : call.caller_id;
          recipientIdentity = identityFor(recipientId);
        }

        const { data: config } = await admin
          .from("voice_configuration")
          .select("token_ttl_seconds")
          .eq("id", true)
          .maybeSingle();
        const ttl = Math.min(3600, Math.max(300, config?.token_ttl_seconds ?? 3600));
        const token = new AccessToken(accountSid, apiKey, apiSecret, {
          identity: identityFor(user.id),
          ttl,
        });
        token.addGrant(new VoiceGrant({ outgoingApplicationSid: twimlAppSid, incomingAllow: true }));

        return Response.json({
          token: token.toJwt(),
          identity: identityFor(user.id),
          recipientIdentity,
          expiresIn: ttl,
        });
      },
    },
  },
});
