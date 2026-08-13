import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type IceConfig = {
  iceServers: IceServerConfig[];
  /** True only when a real TURN relay credential was issued for this call. */
  relay: boolean;
  /** Which relay path issued the credential, for diagnostics only. */
  provider: "metered" | "shared_secret" | "none";
  /** Machine-readable reason a relay is unavailable, for honest UI copy. */
  reason?: "not_configured" | "provider_error";
};

/**
 * Fallback for when no relay is configured. Public STUN alone cannot traverse
 * symmetric or carrier-grade NAT, which is common on Ugandan mobile networks.
 */
const PUBLIC_STUN: IceServerConfig[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

/** Long enough to gather candidates, short enough that a leaked value is worthless. */
const CREDENTIAL_TTL_SECONDS = 600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hasRelayUrl(servers: IceServerConfig[]) {
  return servers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => url.startsWith("turn:") || url.startsWith("turns:"));
  });
}

/**
 * Metered (Open Relay) mints its own short-lived credentials, so the API key
 * itself never reaches the browser.
 */
async function fetchMeteredIce(apiKey: string, appName: string): Promise<IceServerConfig[] | null> {
  const response = await fetch(
    `https://${encodeURIComponent(appName)}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`,
    { headers: { accept: "application/json" } },
  );
  if (!response.ok) {
    console.error("[turn] Metered rejected the credential request", response.status);
    return null;
  }
  const body = (await response.json()) as IceServerConfig[] | { iceServers?: IceServerConfig[] };
  const servers = Array.isArray(body) ? body : (body.iceServers ?? []);
  return servers.filter((server) => !!server?.urls);
}

/**
 * Standard coturn `use-auth-secret` (TURN REST API) credentials: the username
 * carries the expiry, the password is an HMAC over it. Derived in the Worker
 * with Web Crypto so the shared secret never leaves the server.
 */
async function deriveSharedSecretIce(
  urls: string[],
  secret: string,
  callId: string,
): Promise<IceServerConfig[]> {
  const username = `${Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS}:${callId}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username));
  const credential = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return [{ urls, username, credential }];
}


/**
 * Mints short-lived TURN relay credentials for one call. Only the two
 * participants of that call can obtain credentials, so the endpoint cannot be
 * used as a free relay by anyone who finds it.
 *
 * Provider order: Metered, then any standards-based TURN server configured with
 * a shared secret, then public STUN with an honest "no relay" answer.
 */
export const getIceConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { callId: string }) => {
    if (!input || typeof input.callId !== "string" || !UUID.test(input.callId)) {
      throw new Error("A valid call id is required.");
    }
    return { callId: input.callId };
  })
  .handler(async ({ data, context }): Promise<IceConfig> => {
    const { data: call, error } = await context.supabase
      .from("emergency_calls")
      .select("id, caller_id, recipient_id")
      .eq("id", data.callId)
      .maybeSingle();

    if (error) throw new Error("We could not verify this call.");
    if (!call || (call.caller_id !== context.userId && call.recipient_id !== context.userId)) {
      throw new Error("You are not a participant in this call.");
    }

    const meteredKey = process.env["METERED_API_KEY"];
    const meteredApp = process.env["METERED_APP_NAME"] || "openrelay";
    const turnUrls = (process.env["TURN_URLS"] || "")
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean);
    const turnSecret = process.env["TURN_SHARED_SECRET"];

    if (meteredKey) {
      try {
        const issued = await fetchMeteredIce(meteredKey, meteredApp);
        if (issued && hasRelayUrl(issued)) {
          return { iceServers: issued, relay: true, provider: "metered" };
        }
        if (issued) {
          return {
            iceServers: [...issued, ...PUBLIC_STUN],
            relay: false,
            provider: "none",
            reason: "provider_error",
          };
        }
      } catch (cause) {
        console.error("[turn] Could not reach Metered", cause);
      }
      // Fall through to the shared-secret server, if one is configured.
    }

    if (turnUrls.length && turnSecret) {
      try {
        const issued = await deriveSharedSecretIce(turnUrls, turnSecret, data.callId);
        if (hasRelayUrl(issued)) {
          return {
            iceServers: [...issued, ...PUBLIC_STUN],
            relay: true,
            provider: "shared_secret",
          };
        }
      } catch (cause) {
        console.error("[turn] Could not derive shared-secret credentials", cause);
      }
      return {
        iceServers: PUBLIC_STUN,
        relay: false,
        provider: "none",
        reason: "provider_error",
      };
    }

    if (meteredKey) {
      return {
        iceServers: PUBLIC_STUN,
        relay: false,
        provider: "none",
        reason: "provider_error",
      };
    }

    return { iceServers: PUBLIC_STUN, relay: false, provider: "none", reason: "not_configured" };

  });
