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
 * Mints short-lived Cloudflare TURN credentials for one call. Only the two
 * participants of that call can obtain credentials, so the endpoint cannot be
 * used as a free relay by anyone holding an account.
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

    const keyId = process.env["CLOUDFLARE_TURN_KEY_ID"];
    const apiToken = process.env["CLOUDFLARE_TURN_API_TOKEN"];
    if (!keyId || !apiToken) {
      return { iceServers: PUBLIC_STUN, relay: false, reason: "not_configured" };
    }

    try {
      const response = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
        },
      );

      if (!response.ok) {
        console.error("[turn] Cloudflare rejected the credential request", response.status);
        return { iceServers: PUBLIC_STUN, relay: false, reason: "provider_error" };
      }

      const body = (await response.json()) as {
        iceServers?: IceServerConfig | IceServerConfig[];
      };
      const issued = body.iceServers
        ? Array.isArray(body.iceServers)
          ? body.iceServers
          : [body.iceServers]
        : [];

      const hasRelay = issued.some((server) => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        return urls.some((url) => url.startsWith("turn:") || url.startsWith("turns:"));
      });

      if (!hasRelay) {
        return { iceServers: [...issued, ...PUBLIC_STUN], relay: false, reason: "provider_error" };
      }

      return { iceServers: issued, relay: true };
    } catch (cause) {
      console.error("[turn] Could not reach the relay provider", cause);
      return { iceServers: PUBLIC_STUN, relay: false, reason: "provider_error" };
    }
  });
