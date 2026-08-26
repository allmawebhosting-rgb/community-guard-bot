import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { loadZegoServerAssistant } from "@/lib/zego.server";

function jsonError(message: string, status: number, code: string) {
  return Response.json({ success: false, code, error: message }, { status });
}

function zegoUserId(userId: string) {
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
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : data.user;
}

export const Route = createFileRoute("/api/zego-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await authenticate(request);
        if (!user) return jsonError("Authentication is required.", 401, "AUTH_REQUIRED");

        let body: { callId?: string };
        try {
          body = (await request.json()) as { callId?: string };
        } catch {
          return jsonError("A valid call is required.", 400, "INVALID_CALL");
        }
        if (!body.callId || !/^[0-9a-f-]{36}$/i.test(body.callId)) {
          return jsonError("A valid call is required.", 400, "INVALID_CALL");
        }

        const appId = Number(process.env.ZEGOCLOUD_APP_ID);
        const serverSecret = process.env.ZEGOCLOUD_SERVER_SECRET;
        const server = process.env.ZEGOCLOUD_SERVER_URL ?? "wss://webliveroom1-api.zegocloud.com/ws";
        if (!Number.isSafeInteger(appId) || appId <= 0 || !serverSecret) {
          console.error("[ALLMA VOICE] missing ZEGOCLOUD configuration", {
            appIdConfigured: Number.isSafeInteger(appId) && appId > 0,
            secretConfigured: Boolean(serverSecret),
          });
          return jsonError("Unable to configure voice calling.", 503, "MISSING_ZEGO_CONFIG");
        }

        const admin = createAdmin();
        const { data: call, error } = await admin
          .from("emergency_calls")
          .select("id, caller_id, recipient_id, status, zego_room_id")
          .eq("id", body.callId)
          .maybeSingle();
        if (error || !call || (call.caller_id !== user.id && call.recipient_id !== user.id)) {
          return jsonError("You cannot call this person.", 403, "CALL_NOT_AUTHORIZED");
        }
        if (["ended", "declined", "missed", "failed"].includes(call.status)) {
          return jsonError("This call already ended — they may be calling again.", 409, "CALL_NOT_ACTIVE");
        }

        const roomId = call.zego_room_id || `allma-call-${call.id}`;
        const userId = zegoUserId(user.id);
        let token: string;
        try {
          const { generateToken04 } = await loadZegoServerAssistant();
          token = generateToken04(appId, userId, serverSecret, 3600, "");
        } catch (error) {
          console.error("[ALLMA VOICE] token generation failed", {
            callId: call.id,
            userId,
            message: error instanceof Error ? error.message : "unknown",
          });
          return jsonError("Unable to authenticate voice session.", 503, "TOKEN_GENERATION_FAILED");
        }
        const { error: updateError } = await admin
          .from("emergency_calls")
          .update({
            zego_room_id: roomId,
            provider_mode: "zego",
            provider_confirmed: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", call.id);
        if (updateError) {
          console.error("Could not assign ZEGOCLOUD transport", updateError.message);
          return jsonError("Unable to create the voice session.", 500, "SESSION_CREATE_FAILED");
        }

        return Response.json({ token, appId, server, roomId, userId, expiresIn: 3600 });
      },
    },
  },
});
