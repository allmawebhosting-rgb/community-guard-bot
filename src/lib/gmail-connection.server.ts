/**
 * Lets a user connect their own Gmail so Allma sends mail from their address.
 * Google OAuth only: Allma never sees or stores the account password. The refresh
 * token is AES-GCM encrypted at rest and only the server can read it.
 */

function runtimeEnv(name: string): string {
  const fromProcess = (process.env[name] || "").trim();
  if (fromProcess) return fromProcess;
  const cf = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  const fromCf = cf?.[name];
  return typeof fromCf === "string" ? fromCf.trim() : "";
}

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "openid",
  "email",
] as const;

export function isGoogleEmailConfigured() {
  return Boolean(runtimeEnv("GOOGLE_OAUTH_CLIENT_ID") && runtimeEnv("GOOGLE_OAUTH_CLIENT_SECRET"));
}

export function gmailRedirectUri(origin: string) {
  return `${origin.replace(/\/+$/, "")}/api/email/google/callback`;
}

function secretMaterial() {
  return runtimeEnv("EMAIL_TOKEN_KEY") || runtimeEnv("SUPABASE_SERVICE_ROLE_KEY");
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64Url(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function aesKey(material: string) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`allma-email-token:${material}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(plain: string, material = secretMaterial()) {
  if (!material) throw new Error("email_token_key_missing");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await aesKey(material),
    enc.encode(plain),
  );
  return `${toB64Url(iv)}.${toB64Url(new Uint8Array(cipher))}`;
}

export async function decryptToken(payload: string, material = secretMaterial()) {
  if (!material) throw new Error("email_token_key_missing");
  const [iv, cipher] = payload.split(".");
  if (!iv || !cipher) throw new Error("email_token_invalid");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64Url(iv) },
    await aesKey(material),
    fromB64Url(cipher),
  );
  return dec.decode(plain);
}

async function hmac(data: string, material: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(`allma-email-state:${material}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toB64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

const STATE_TTL_MS = 10 * 60 * 1000;

/** Signed, short-lived OAuth state binding the callback to the user who started it. */
export async function signOAuthState(
  input: { userId: string; origin: string },
  now = Date.now(),
  material = secretMaterial(),
) {
  if (!material) throw new Error("email_token_key_missing");
  const body = toB64Url(
    enc.encode(JSON.stringify({ u: input.userId, o: input.origin, t: now, n: crypto.randomUUID() })),
  );
  return `${body}.${await hmac(body, material)}`;
}

export async function verifyOAuthState(
  state: string,
  now = Date.now(),
  material = secretMaterial(),
): Promise<{ userId: string; origin: string } | null> {
  if (!material) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  if ((await hmac(body, material)) !== sig) return null;
  try {
    const parsed = JSON.parse(dec.decode(fromB64Url(body))) as { u?: string; o?: string; t?: number };
    if (!parsed.u || !parsed.o || typeof parsed.t !== "number") return null;
    if (now - parsed.t > STATE_TTL_MS || parsed.t > now + 60_000) return null;
    return { userId: parsed.u, origin: parsed.o };
  } catch {
    return null;
  }
}

export async function buildGoogleAuthUrl(input: { userId: string; origin: string }) {
  const params = new URLSearchParams({
    client_id: runtimeEnv("GOOGLE_OAUTH_CLIENT_ID"),
    redirect_uri: gmailRedirectUri(input.origin),
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: await signOAuthState(input),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  error?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: runtimeEnv("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: runtimeEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
      ...body,
    }),
  });
  return (await res.json().catch(() => ({}))) as TokenResponse;
}

function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(dec.decode(fromB64Url(idToken.split(".")[1] ?? ""))) as {
      email?: string;
      email_verified?: boolean;
    };
    return payload.email && payload.email_verified !== false ? payload.email : null;
  } catch {
    return null;
  }
}

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // The table is new, so it is not in the generated types yet.
  return supabaseAdmin as unknown as {
    from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}

export async function completeGoogleConnection(input: { userId: string; origin: string; code: string }) {
  const tokens = await postToken({
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: gmailRedirectUri(input.origin),
  });
  const email = emailFromIdToken(tokens.id_token);
  if (!tokens.refresh_token || !email) {
    return { ok: false as const, error: tokens.error || "no_refresh_token" };
  }
  if (!(tokens.scope ?? "").includes("gmail.send")) {
    return { ok: false as const, error: "send_permission_not_granted" };
  }
  const db = await adminClient();
  const { error } = await db.from("user_email_connections").upsert(
    {
      user_id: input.userId,
      provider: "google",
      email,
      refresh_token_enc: await encryptToken(tokens.refresh_token),
      scopes: tokens.scope ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return { ok: false as const, error: "save_failed" };
  return { ok: true as const, email };
}

export async function getEmailConnection(userId: string): Promise<{ email: string } | null> {
  const db = await adminClient();
  const { data } = await db
    .from("user_email_connections")
    .select("email")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.email ? { email: String(data.email) } : null;
}

export async function disconnectEmail(userId: string) {
  const db = await adminClient();
  const { data } = await db
    .from("user_email_connections")
    .select("refresh_token_enc")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.refresh_token_enc) {
    try {
      const token = await decryptToken(String(data.refresh_token_enc));
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: "POST",
      });
    } catch {
      // Revocation is best effort; the stored token is deleted regardless.
    }
  }
  await db.from("user_email_connections").delete().eq("user_id", userId);
}

function encodeHeader(value: string) {
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${btoa(String.fromCharCode(...enc.encode(value)))}?=`;
}

function stripHeaderBreaks(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2822 message, base64url encoded for the Gmail API. */
export function buildRawMessage(input: {
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string | null;
}) {
  const body = btoa(String.fromCharCode(...enc.encode(input.text.replace(/\r?\n/g, "\r\n"))));
  const bodyLines = body.match(/.{1,76}/g)?.join("\r\n") ?? "";
  const lines = [
    `From: ${stripHeaderBreaks(input.from)}`,
    `To: ${stripHeaderBreaks(input.to)}`,
    ...(input.replyTo ? [`Reply-To: ${stripHeaderBreaks(input.replyTo)}`] : []),
    `Subject: ${encodeHeader(stripHeaderBreaks(input.subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    bodyLines,
  ];
  return toB64Url(enc.encode(lines.join("\r\n")));
}

export type SendAsUserResult =
  | { success: true; messageId: string | null; from: string }
  | { success: false; error: string };

/** Send from the user's own connected Gmail. Never falls back silently to another sender. */
export async function sendViaConnectedGmail(input: {
  userId: string;
  to: string;
  subject: string;
  text: string;
}): Promise<SendAsUserResult> {
  if (!isGoogleEmailConfigured()) return { success: false, error: "google_not_configured" };
  const db = await adminClient();
  const { data } = await db
    .from("user_email_connections")
    .select("email, refresh_token_enc")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!data?.refresh_token_enc) return { success: false, error: "gmail_not_connected" };

  let refreshToken: string;
  try {
    refreshToken = await decryptToken(String(data.refresh_token_enc));
  } catch {
    return { success: false, error: "gmail_reconnect_required" };
  }
  const tokens = await postToken({ refresh_token: refreshToken, grant_type: "refresh_token" });
  if (!tokens.access_token) {
    if (tokens.error === "invalid_grant") {
      await db.from("user_email_connections").delete().eq("user_id", input.userId);
      return { success: false, error: "gmail_reconnect_required" };
    }
    return { success: false, error: "gmail_token_failed" };
  }

  const from = String(data.email);
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: buildRawMessage({ from, to: input.to, subject: input.subject, text: input.text }) }),
  });
  if (!res.ok) {
    console.error("[gmail] send failed", res.status);
    return { success: false, error: `gmail_${res.status}` };
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { success: true, messageId: json.id ?? null, from };
}
