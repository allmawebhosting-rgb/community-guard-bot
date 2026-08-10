import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type VoiceAction = "start" | "accept" | "end";
type ProviderStatus = "connecting" | "ringing" | "connected" | "reconnecting" | "ended" | "failed";

type ProviderSession = {
  sessionId: string;
  status: ProviderStatus;
  token?: string;
  expiresAt?: string;
  signalUrl?: string;
  iceServers?: Array<{ urls: string | string[]; username?: string; credential?: string }>;
};

const providerBaseUrl = () => process.env.VOICE_PROVIDER_BASE_URL?.replace(/\/+$/, "");
const providerApiKey = () => process.env.VOICE_PROVIDER_API_KEY;

function isNewSupabaseApiKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function supabaseFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (isNewSupabaseApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

function createUserSupabase(accessToken: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  return createClient<Database>(url, key, {
    global: {
      fetch: supabaseFetch(key),
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

function createAdminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server-side call state storage is not configured.");
  return createClient(url, key, {
    global: { fetch: supabaseFetch(key) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function providerStatus(value: unknown): ProviderStatus {
  if (
    value === "connecting" ||
    value === "ringing" ||
    value === "connected" ||
    value === "reconnecting" ||
    value === "ended" ||
    value === "failed"
  ) {
    return value;
  }
  throw new Error("Voice provider returned an invalid session state.");
}

async function providerRequest(path: string, init?: RequestInit): Promise<ProviderSession> {
  const baseUrl = providerBaseUrl();
  const apiKey = providerApiKey();
  if (!baseUrl || !apiKey) {
    throw new Error(
      "No approved voice provider is configured. This workspace remains in DEMO CALL MODE.",
    );
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as Partial<ProviderSession> & {
    error?: string;
  };
  if (!response.ok)
    throw new Error(body.error ?? "The approved voice provider rejected the request.");
  if (typeof body.sessionId !== "string")
    throw new Error("Voice provider did not return a session ID.");
  if (body.signalUrl && typeof body.token !== "string")
    throw new Error("Voice provider did not return a short-lived signalling token.");
  if (body.signalUrl && typeof body.expiresAt !== "string")
    throw new Error("Voice provider did not return a session expiry.");
  return {
    sessionId: body.sessionId,
    status: providerStatus(body.status),
    token: body.token,
    expiresAt: body.expiresAt,
    signalUrl: body.signalUrl,
    iceServers: body.iceServers,
  };
}

function providerSessionPayload(session: ProviderSession) {
  return {
    provider: "webrtc" as const,
    status: session.status,
    sessionId: session.sessionId,
    token: session.token,
    expiresAt: session.expiresAt,
    signalUrl: session.signalUrl,
    iceServers: session.iceServers ?? [],
    providerConfirmed: session.status === "connected",
  };
}

async function authenticate(request: Request) {
  const accessToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!accessToken) return null;
  const userSupabase = createUserSupabase(accessToken);
  const { data, error } = await userSupabase.auth.getUser();
  if (error || !data.user) return null;
  return { userId: data.user.id, userSupabase, adminSupabase: createAdminSupabase() };
}

async function getParticipantCall(
  adminSupabase: ReturnType<typeof createAdminSupabase>,
  callId: string,
  userId: string,
) {
  const { data, error } = await adminSupabase
    .from("emergency_calls")
    .select("id, caller_id, recipient_id, status, provider_mode")
    .eq("id", callId)
    .maybeSingle();
  if (error) throw new Error("Unable to load the emergency call.");
  if (!data || (data.caller_id !== userId && data.recipient_id !== userId)) return null;
  return data;
}

async function persistProviderState(
  adminSupabase: ReturnType<typeof createAdminSupabase>,
  callId: string,
  session: ProviderSession,
  action: VoiceAction,
) {
  const confirmed = session.status === "connected";
  const callStatus =
    session.status === "connected"
      ? "connected"
      : session.status === "ended"
        ? "ended"
        : session.status === "failed"
          ? "failed"
          : action === "accept"
            ? "accepted"
            : session.status === "ringing"
              ? "ringing"
              : "calling";

  const now = new Date().toISOString();
  const { error: callError } = await adminSupabase
    .from("emergency_calls")
    .update({
      status: callStatus,
      provider_mode: "webrtc",
      provider_confirmed: confirmed,
      connected_at: confirmed ? now : null,
      ended_at: session.status === "ended" ? now : null,
      failure_reason: session.status === "failed" ? "Provider reported failure." : null,
    })
    .eq("id", callId);
  if (callError) throw new Error("Unable to persist the authoritative call state.");

  const { error: sessionError } = await adminSupabase.from("call_sessions").upsert(
    {
      emergency_call_id: callId,
      webrtc_session_id: session.sessionId,
      status:
        session.status === "failed"
          ? "disconnected"
          : session.status === "ended"
            ? "ended"
            : session.status,
      provider_confirmed: confirmed,
      provider_expires_at: session.expiresAt ?? null,
      last_provider_event_at: now,
    },
    { onConflict: "emergency_call_id" },
  );
  if (sessionError) throw new Error("Unable to persist the provider session state.");
}

export const Route = createFileRoute("/api/voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          action?: VoiceAction;
          callId?: string;
          recipientId?: string;
          sessionId?: string;
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return jsonError("Invalid request body.", 400);
        }
        if (!body.action || !body.callId || !["start", "accept", "end"].includes(body.action)) {
          return jsonError("A valid action and call ID are required.", 400);
        }

        try {
          const auth = await authenticate(request);
          if (!auth) return jsonError("Authentication is required.", 401);
          const call = await getParticipantCall(auth.adminSupabase, body.callId, auth.userId);
          if (!call) return jsonError("Call not found or participant access denied.", 404);
          if (body.action === "start" && call.caller_id !== auth.userId) {
            return jsonError("Only the caller can start this call.", 403);
          }
          if (body.action === "accept" && call.recipient_id !== auth.userId) {
            return jsonError("Only the recipient can accept this call.", 403);
          }

          const path =
            body.action === "end"
              ? `/sessions/${encodeURIComponent(body.callId)}/end`
              : "/sessions";
          const session = await providerRequest(path, {
            method: body.action === "end" ? "POST" : "POST",
            body: JSON.stringify({
              callId: body.callId,
              sessionId: body.sessionId,
              recipientId: body.recipientId,
              action: body.action,
            }),
          });
          await persistProviderState(auth.adminSupabase, body.callId, session, body.action);
          return Response.json({ session: providerSessionPayload(session) });
        } catch (error) {
          console.error("Voice provider request failed", error);
          return jsonError(
            error instanceof Error ? error.message : "Voice provider unavailable.",
            503,
          );
        }
      },
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const callId = url.searchParams.get("callId");
        const sessionId = url.searchParams.get("sessionId");
        if (!callId || !sessionId) return jsonError("Call and session IDs are required.", 400);
        try {
          const auth = await authenticate(request);
          if (!auth) return jsonError("Authentication is required.", 401);
          const call = await getParticipantCall(auth.adminSupabase, callId, auth.userId);
          if (!call) return jsonError("Call not found or participant access denied.", 404);
          const session = await providerRequest(`/sessions/${encodeURIComponent(sessionId)}`, {
            method: "GET",
          });
          await persistProviderState(auth.adminSupabase, callId, session, "accept");
          return Response.json({ session: providerSessionPayload(session) });
        } catch (error) {
          console.error("Voice provider state check failed", error);
          return jsonError(
            error instanceof Error ? error.message : "Voice provider unavailable.",
            503,
          );
        }
      },
    },
  },
});
