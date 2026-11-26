/**
 * Lets a user connect their own Gmail so Allma can send mail from their address.
 * Google OAuth only (scope gmail.send): Allma never sees the account password and can never
 * read mail. Tokens are AES-GCM encrypted with GMAIL_TOKEN_ENC_KEY and only the server
 * (service role) reads them; they never reach the browser. Nothing here logs a token.
 */

function runtimeEnv(name: string): string {
  const fromProcess = (process.env[name] || "").trim();
  if (fromProcess) return fromProcess;
  const cf = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  const fromCf = cf?.[name];
  return typeof fromCf === "string" ? fromCf.trim() : "";
}

export const GMAIL_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.send",
] as const;

export const GMAIL_DAILY_LIMIT = 20;
export const OAUTH_FLOW_COOKIE = "allma_gmail_oauth";
const FLOW_TTL_MS = 10 * 60 * 1000;

export function isGoogleEmailConfigured() {
  return Boolean(
    runtimeEnv("GOOGLE_OAUTH_CLIENT_ID") &&
      runtimeEnv("GOOGLE_OAUTH_CLIENT_SECRET") &&
      runtimeEnv("GMAIL_TOKEN_ENC_KEY"),
  );
}

export function gmailRedirectUri(origin: string) {
  return `${origin.replace(/\/+$/, "")}/api/email/google/callback`;
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

/** GMAIL_TOKEN_ENC_KEY is 32 random bytes, base64 (standard or url-safe). */
function keyBytes(keyB64: string): Uint8Array {
  if (!keyB64) throw new Error("gmail_token_key_missing");
  const bytes = fromB64Url(keyB64.replace(/=+$/, ""));
  if (bytes.length !== 32) throw new Error("gmail_token_key_invalid");
  return bytes;
}

async function aesKey(keyB64: string) {
  return crypto.subtle.importKey("raw", keyBytes(keyB64) as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(plain: string, keyB64 = runtimeEnv("GMAIL_TOKEN_ENC_KEY")) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(keyB64), enc.encode(plain));
  return `${toB64Url(iv)}.${toB64Url(new Uint8Array(cipher))}`;
}

export async function decryptToken(payload: string, keyB64 = runtimeEnv("GMAIL_TOKEN_ENC_KEY")) {
  const [iv, cipher] = payload.split(".");
  if (!iv || !cipher) throw new Error("gmail_token_invalid");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64Url(iv) },
    await aesKey(keyB64),
    fromB64Url(cipher),
  );
  return dec.decode(plain);
}

async function hmac(data: string, keyB64: string) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`allma-gmail-flow:${toB64Url(keyBytes(keyB64))}`));
  const key = await crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toB64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

function randomToken(bytes = 32) {
  return toB64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string) {
  return toB64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(verifier))));
}

export type OAuthFlow = { state: string; verifier: string; userId: string; origin: string };

/**
 * Short-lived, signed, HttpOnly cookie that carries the PKCE verifier and ties the callback
 * to the signed-in user and browser that started the flow.
 */
export async function signFlowCookie(flow: OAuthFlow, now = Date.now(), keyB64 = runtimeEnv("GMAIL_TOKEN_ENC_KEY")) {
  const body = toB64Url(
    enc.encode(JSON.stringify({ s: flow.state, v: flow.verifier, u: flow.userId, o: flow.origin, t: now })),
  );
  return `${body}.${await hmac(body, keyB64)}`;
}

export async function verifyFlowCookie(
  cookie: string,
  state: string,
  now = Date.now(),
  keyB64 = runtimeEnv("GMAIL_TOKEN_ENC_KEY"),
): Promise<OAuthFlow | null> {
  const [body, sig] = cookie.split(".");
  if (!body || !sig || !state) return null;
  let expected: string;
  try {
    expected = await hmac(body, keyB64);
  } catch {
    return null;
  }
  if (expected !== sig) return null;
  try {
    const p = JSON.parse(dec.decode(fromB64Url(body))) as {
      s?: string;
      v?: string;
      u?: string;
      o?: string;
      t?: number;
    };
    if (!p.s || !p.v || !p.u || !p.o || typeof p.t !== "number") return null;
    if (p.s !== state) return null;
    if (now - p.t > FLOW_TTL_MS || p.t > now + 60_000) return null;
    return { state: p.s, verifier: p.v, userId: p.u, origin: p.o };
  } catch {
    return null;
  }
}

export function flowCookieHeader(value: string, secure: boolean) {
  return `${OAUTH_FLOW_COOKIE}=${value}; Path=/api/email/google; Max-Age=${FLOW_TTL_MS / 1000}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function clearFlowCookieHeader(secure: boolean) {
  return `${OAUTH_FLOW_COOKIE}=; Path=/api/email/google; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function readCookie(header: string | null, name: string) {
  for (const part of (header ?? "").split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

/** Everything needed to start consent: the Google URL and the cookie that must accompany the callback. */
export async function beginGoogleConnection(input: { userId: string; origin: string }) {
  const state = randomToken(24);
  const verifier = randomToken(48);
  const params = new URLSearchParams({
    client_id: runtimeEnv("GOOGLE_OAUTH_CLIENT_ID"),
    redirect_uri: gmailRedirectUri(input.origin),
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
  });
  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    cookie: await signFlowCookie({ state, verifier, userId: input.userId, origin: input.origin }),
  };
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
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

async function emailFromUserinfo(accessToken: string): Promise<string | null> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => null);
  if (!res?.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { email?: string };
  return json.email ?? null;
}

type Db = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

async function adminClient(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // These tables are new, so they are not in the generated types yet.
  return supabaseAdmin as unknown as Db;
}

export function hasSendScope(scope: string | undefined) {
  return (scope ?? "").split(/\s+/).includes("https://www.googleapis.com/auth/gmail.send");
}

export async function completeGoogleConnection(input: { userId: string; origin: string; code: string; verifier: string }) {
  const tokens = await postToken({
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: gmailRedirectUri(input.origin),
    code_verifier: input.verifier,
  });
  if (!tokens.access_token) return { ok: false as const, error: tokens.error || "token_exchange_failed" };
  if (!hasSendScope(tokens.scope)) return { ok: false as const, error: "send_permission_not_granted" };
  if (!tokens.refresh_token) return { ok: false as const, error: "no_refresh_token" };
  const email = emailFromIdToken(tokens.id_token) ?? (await emailFromUserinfo(tokens.access_token));
  if (!email) return { ok: false as const, error: "no_email" };

  const db = await adminClient();
  const now = Date.now();
  const { error } = await db.from("gmail_connections").upsert(
    {
      user_id: input.userId,
      google_email: email,
      refresh_token_encrypted: await encryptToken(tokens.refresh_token),
      access_token_encrypted: await encryptToken(tokens.access_token),
      expires_at: new Date(now + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      scope: tokens.scope ?? null,
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return { ok: false as const, error: "save_failed" };
  return { ok: true as const, email };
}

export async function getEmailConnection(userId: string): Promise<{ email: string } | null> {
  const db = await adminClient();
  const { data } = await db.from("gmail_connections").select("google_email").eq("user_id", userId).maybeSingle();
  return data?.google_email ? { email: String(data.google_email) } : null;
}

export async function disconnectEmail(userId: string) {
  const db = await adminClient();
  const { data } = await db
    .from("gmail_connections")
    .select("refresh_token_encrypted")
    .eq("user_id", userId)
    .maybeSingle();
  let revoked = false;
  if (data?.refresh_token_encrypted) {
    try {
      const token = await decryptToken(String(data.refresh_token_encrypted));
      const res = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: "POST",
      });
      revoked = res.ok;
    } catch {
      // Revocation is best effort; the stored token is deleted regardless.
    }
  }
  await db.from("gmail_connections").delete().eq("user_id", userId);
  return { revoked };
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
export function buildRawMessage(input: { from: string; to: string; subject: string; text: string }) {
  const body = btoa(String.fromCharCode(...enc.encode(input.text.replace(/\r?\n/g, "\r\n"))));
  const bodyLines = body.match(/.{1,76}/g)?.join("\r\n") ?? "";
  const lines = [
    `From: ${stripHeaderBreaks(input.from)}`,
    `To: ${stripHeaderBreaks(input.to)}`,
    `Subject: ${encodeHeader(stripHeaderBreaks(input.subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    bodyLines,
  ];
  return toB64Url(enc.encode(lines.join("\r\n")));
}

const EMAIL_RE = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]+$/;

export type OutgoingEmail = { to: string; subject: string; body: string };

/** One recipient only; no empty subject/body. */
export function validateOutgoingEmail(input: OutgoingEmail):
  | { ok: true; value: OutgoingEmail }
  | { ok: false; error: "invalid_recipient" | "empty_subject" | "empty_body" } {
  const to = String(input.to ?? "").trim();
  if (!EMAIL_RE.test(to) || to.length > 200) return { ok: false, error: "invalid_recipient" };
  const subject = stripHeaderBreaks(String(input.subject ?? "")).slice(0, 200);
  if (!subject) return { ok: false, error: "empty_subject" };
  const body = String(input.body ?? "").trim().slice(0, 8000);
  if (!body) return { ok: false, error: "empty_body" };
  return { ok: true, value: { to, subject, body } };
}

export function isAccessTokenFresh(expiresAt: string | null | undefined, now = Date.now()) {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t - now > 60_000;
}

export type SendGmailResult =
  | { success: true; messageId: string | null; from: string; to: string }
  | { success: false; error: string };

async function logSend(
  db: Db,
  row: { userId: string; to: string; subject: string; messageId: string | null; status: "sent" | "failed"; error?: string },
) {
  await db
    .from("email_sends")
    .insert({
      user_id: row.userId,
      to_email: row.to,
      subject: row.subject,
      gmail_message_id: row.messageId,
      status: row.status,
      error: row.error ?? null,
    })
    .then(() => undefined, () => undefined);
}

/** Send from the signed-in user's own connected Gmail. Never falls back to another sender. */
export async function sendGmail(userId: string, input: OutgoingEmail): Promise<SendGmailResult> {
  if (!isGoogleEmailConfigured()) return { success: false, error: "google_not_configured" };
  const checked = validateOutgoingEmail(input);
  if (!checked.ok) return { success: false, error: checked.error };
  const { to, subject, body } = checked.value;

  const db = await adminClient();
  const { data: row } = await db
    .from("gmail_connections")
    .select("google_email, refresh_token_encrypted, access_token_encrypted, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!row?.refresh_token_encrypted) return { success: false, error: "gmail_not_connected" };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from("email_sends")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "sent")
    .gte("created_at", since);
  if ((count ?? 0) >= GMAIL_DAILY_LIMIT) return { success: false, error: "daily_limit" };

  const from = String(row.google_email);
  const fail = async (error: string): Promise<SendGmailResult> => {
    await logSend(db, { userId, to, subject, messageId: null, status: "failed", error });
    return { success: false, error };
  };

  async function refresh(): Promise<string | "reconnect" | null> {
    let refreshToken: string;
    try {
      refreshToken = await decryptToken(String(row.refresh_token_encrypted));
    } catch {
      return "reconnect";
    }
    const tokens = await postToken({ refresh_token: refreshToken, grant_type: "refresh_token" });
    if (!tokens.access_token) {
      if (tokens.error === "invalid_grant") {
        await db.from("gmail_connections").delete().eq("user_id", userId);
        return "reconnect";
      }
      return null;
    }
    await db
      .from("gmail_connections")
      .update({
        access_token_encrypted: await encryptToken(tokens.access_token),
        expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    return tokens.access_token;
  }

  let accessToken: string | null = null;
  if (row.access_token_encrypted && isAccessTokenFresh(row.expires_at)) {
    accessToken = await decryptToken(String(row.access_token_encrypted)).catch(() => null);
  }
  if (!accessToken) {
    const refreshed = await refresh();
    if (refreshed === "reconnect") return fail("reconnect_needed");
    if (!refreshed) return fail("gmail_token_failed");
    accessToken = refreshed;
  }

  const raw = buildRawMessage({ from, to, subject, text: body });
  const send = (token: string) =>
    fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });

  let res = await send(accessToken);
  if (res.status === 401) {
    const refreshed = await refresh();
    if (refreshed === "reconnect") return fail("reconnect_needed");
    if (!refreshed) return fail("gmail_token_failed");
    res = await send(refreshed);
  }
  if (!res.ok) {
    console.error("[gmail] send failed", res.status);
    return fail(`gmail_${res.status}`);
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  await logSend(db, { userId, to, subject, messageId: json.id ?? null, status: "sent" });
  return { success: true, messageId: json.id ?? null, from, to };
}
