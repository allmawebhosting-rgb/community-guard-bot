/**
 * Server-only relay diagnostics. Probes the configured TURN provider exactly the
 * way a live call would, and reports the provider's real answer — never a
 * simulated "healthy" result.
 */

export type RelayProbe = {
  provider: "metered" | "shared_secret";
  label: string;
  ok: boolean;
  /** Short, human-readable outcome shown in the app. */
  summary: string;
  /** HTTP status returned by the provider, when the probe made a request. */
  status?: number;
  /** Verbatim (truncated, secret-free) error text from the provider. */
  detail?: string;
  /** How many TURN (relay) URLs the provider actually returned. */
  relayUrls?: number;
};

export type RelayHealth = {
  checkedAt: string;
  configured: boolean;
  /** True only if at least one provider issued usable relay credentials. */
  relayReady: boolean;
  probes: RelayProbe[];
  /** Config facts that help spot a wrong app name or missing secret. */
  config: {
    meteredKey: boolean;
    meteredKeyLength: number;
    meteredApp: string | null;
    turnUrls: number;
    turnSecret: boolean;
  };
};

const CREDENTIAL_TTL_SECONDS = 600;

function countRelayUrls(servers: Array<{ urls?: string | string[] }>) {
  let count = 0;
  for (const server of servers) {
    const urls = Array.isArray(server?.urls) ? server.urls : server?.urls ? [server.urls] : [];
    for (const url of urls) {
      if (typeof url === "string" && (url.startsWith("turn:") || url.startsWith("turns:"))) count += 1;
    }
  }
  return count;
}

/** Trim provider output so a long HTML error page can't flood the UI. */
function snippet(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 240 ? `${clean.slice(0, 240)}…` : clean;
}

async function probeMetered(apiKey: string, appName: string): Promise<RelayProbe> {
  const url = `https://${encodeURIComponent(appName)}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;
  const label = `Metered — ${appName}.metered.live`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (cause) {
    return {
      provider: "metered",
      label,
      ok: false,
      summary: "Could not reach Metered from the server.",
      detail: snippet(cause instanceof Error ? cause.message : String(cause)),
    };
  }

  const text = await response.text();

  if (!response.ok) {
    let summary = `Metered rejected the request (HTTP ${response.status}).`;
    if (response.status === 401 || response.status === 403) {
      summary =
        "Metered rejected the API key. Copy the Secret Key from your Metered app's Developers / API Keys page.";
    } else if (response.status === 404) {
      summary = `No Metered app answered at ${appName}.metered.live — check METERED_APP_NAME.`;
    } else if (response.status === 429) {
      summary = "Metered rate-limited the request. Try again in a moment.";
    }
    return { provider: "metered", label, ok: false, summary, status: response.status, detail: snippet(text) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      provider: "metered",
      label,
      ok: false,
      summary: "Metered returned a response that wasn't JSON.",
      status: response.status,
      detail: snippet(text),
    };
  }

  const servers = Array.isArray(parsed)
    ? (parsed as Array<{ urls?: string | string[] }>)
    : ((parsed as { iceServers?: Array<{ urls?: string | string[] }> }).iceServers ?? []);
  const relayUrls = countRelayUrls(servers);

  if (!relayUrls) {
    return {
      provider: "metered",
      label,
      ok: false,
      summary: "Metered accepted the key but returned no TURN relay servers.",
      status: response.status,
      detail: snippet(text),
      relayUrls: 0,
    };
  }

  return {
    provider: "metered",
    label,
    ok: true,
    summary: `Metered issued credentials for ${relayUrls} relay server${relayUrls === 1 ? "" : "s"}.`,
    status: response.status,
    relayUrls,
  };
}

async function probeSharedSecret(urls: string[], secret: string): Promise<RelayProbe> {
  const label = `TURN shared secret — ${urls.join(", ")}`;
  try {
    const username = `${Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS}:relay-health-check`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username));
    const relayUrls = countRelayUrls(urls.map((url) => ({ urls: url })));
    if (!relayUrls) {
      return {
        provider: "shared_secret",
        label,
        ok: false,
        summary: "TURN_URLS has no turn: or turns: address, so no relay can be used.",
        relayUrls: 0,
      };
    }
    return {
      provider: "shared_secret",
      label,
      ok: true,
      summary: `Derived REST credentials for ${relayUrls} relay address${relayUrls === 1 ? "" : "es"}. Reachability is only proven by a real call.`,
      relayUrls,
    };
  } catch (cause) {
    return {
      provider: "shared_secret",
      label,
      ok: false,
      summary: "Could not derive shared-secret credentials.",
      detail: snippet(cause instanceof Error ? cause.message : String(cause)),
    };
  }
}

export async function runRelayHealthCheck(): Promise<RelayHealth> {
  const meteredKey = process.env["METERED_API_KEY"] || "";
  const meteredApp = process.env["METERED_APP_NAME"] || "";
  const turnUrls = (process.env["TURN_URLS"] || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const turnSecret = process.env["TURN_SHARED_SECRET"] || "";

  const probes: RelayProbe[] = [];
  if (meteredKey) probes.push(await probeMetered(meteredKey, meteredApp || "openrelay"));
  if (turnUrls.length && turnSecret) probes.push(await probeSharedSecret(turnUrls, turnSecret));

  return {
    checkedAt: new Date().toISOString(),
    configured: probes.length > 0,
    relayReady: probes.some((probe) => probe.ok),
    probes,
    config: {
      meteredKey: Boolean(meteredKey),
      meteredKeyLength: meteredKey.length,
      meteredApp: meteredApp || null,
      turnUrls: turnUrls.length,
      turnSecret: Boolean(turnSecret),
    },
  };
}
