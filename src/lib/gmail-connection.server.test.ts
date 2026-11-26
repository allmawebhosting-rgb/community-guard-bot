import { describe, expect, it } from "vitest";
import {
  GMAIL_SCOPES,
  buildRawMessage,
  decryptToken,
  encryptToken,
  gmailRedirectUri,
  hasSendScope,
  isAccessTokenFresh,
  pkceChallenge,
  readCookie,
  signFlowCookie,
  validateOutgoingEmail,
  verifyFlowCookie,
} from "./gmail-connection.server";

const KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i + 1)));
const OTHER_KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => 200 - i)));

function decodeRaw(raw: string) {
  return Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

describe("gmail scopes and redirect", () => {
  it("requests exactly openid, userinfo.email and gmail.send", () => {
    expect([...GMAIL_SCOPES]).toEqual([
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/gmail.send",
    ]);
    expect(GMAIL_SCOPES.join(" ")).not.toMatch(/readonly|modify|compose|mail\.google\.com/);
  });

  it("uses the exact callback URL without a trailing slash", () => {
    expect(gmailRedirectUri("https://allmasafetyai.online/")).toBe(
      "https://allmasafetyai.online/api/email/google/callback",
    );
  });

  it("detects whether gmail.send was granted", () => {
    expect(hasSendScope("openid email https://www.googleapis.com/auth/gmail.send")).toBe(true);
    expect(hasSendScope("openid email https://www.googleapis.com/auth/userinfo.email")).toBe(false);
    expect(hasSendScope(undefined)).toBe(false);
  });
});

describe("token encryption", () => {
  it("round-trips and rejects the wrong key or a bad key length", async () => {
    const blob = await encryptToken("1//refresh-token", KEY);
    expect(blob).not.toContain("refresh-token");
    expect(await decryptToken(blob, KEY)).toBe("1//refresh-token");
    await expect(decryptToken(blob, OTHER_KEY)).rejects.toThrow();
    await expect(encryptToken("x", btoa("short"))).rejects.toThrow("gmail_token_key_invalid");
    await expect(encryptToken("x", "")).rejects.toThrow("gmail_token_key_missing");
  });

  it("uses a fresh IV each time", async () => {
    expect(await encryptToken("same", KEY)).not.toBe(await encryptToken("same", KEY));
  });
});

describe("PKCE and OAuth flow cookie", () => {
  it("matches the RFC 7636 S256 example", async () => {
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  const flow = { state: "st4te", verifier: "ver1fier", userId: "user-1", origin: "https://allmasafetyai.online" };

  it("accepts a valid cookie for the matching state only", async () => {
    const now = 5_000_000;
    const cookie = await signFlowCookie(flow, now, KEY);
    expect(await verifyFlowCookie(cookie, "st4te", now + 1000, KEY)).toEqual(flow);
    expect(await verifyFlowCookie(cookie, "other", now + 1000, KEY)).toBeNull();
  });

  it("rejects expired, tampered, or wrongly keyed cookies", async () => {
    const now = 5_000_000;
    const cookie = await signFlowCookie(flow, now, KEY);
    expect(await verifyFlowCookie(cookie, "st4te", now + 11 * 60 * 1000, KEY)).toBeNull();
    expect(await verifyFlowCookie(cookie, "st4te", now, OTHER_KEY)).toBeNull();
    const [body, sig] = cookie.split(".");
    expect(await verifyFlowCookie(`${body}x.${sig}`, "st4te", now, KEY)).toBeNull();
    expect(await verifyFlowCookie("garbage", "st4te", now, KEY)).toBeNull();
  });

  it("reads a named cookie", () => {
    expect(readCookie("a=1; allma_gmail_oauth=abc.def; b=2", "allma_gmail_oauth")).toBe("abc.def");
    expect(readCookie(null, "x")).toBeNull();
  });
});

describe("outgoing email validation", () => {
  it("accepts one recipient and trims fields", () => {
    expect(validateOutgoingEmail({ to: " a@b.co ", subject: " Hi ", body: " Text " })).toEqual({
      ok: true,
      value: { to: "a@b.co", subject: "Hi", body: "Text" },
    });
  });

  it("rejects bad or multiple recipients, empty subject and empty body", () => {
    const base = { to: "a@b.co", subject: "S", body: "B" };
    for (const to of ["", "nope", "a@b.co, c@d.co", "a@b.co;c@d.co", "a@b.co c@d.co", "Name <a@b.co>"]) {
      expect(validateOutgoingEmail({ ...base, to })).toEqual({ ok: false, error: "invalid_recipient" });
    }
    expect(validateOutgoingEmail({ ...base, subject: "  " })).toEqual({ ok: false, error: "empty_subject" });
    expect(validateOutgoingEmail({ ...base, body: "\n " })).toEqual({ ok: false, error: "empty_body" });
  });
});

describe("access token freshness", () => {
  it("needs more than a minute of life left", () => {
    const now = Date.parse("2026-11-26T00:00:00Z");
    expect(isAccessTokenFresh("2026-11-26T00:10:00Z", now)).toBe(true);
    expect(isAccessTokenFresh("2026-11-26T00:00:30Z", now)).toBe(false);
    expect(isAccessTokenFresh(null, now)).toBe(false);
  });
});

describe("RFC 2822 message", () => {
  it("sets From to the user's address, encodes the subject, and blocks header injection", () => {
    const decoded = decodeRaw(
      buildRawMessage({
        from: "me@gmail.com",
        to: "clinic@example.com\r\nBcc: evil@example.com",
        subject: "Help needed — Jinja",
        text: "Dear team,\nPlease help.",
      }),
    );
    expect(decoded).toMatch(/^From: me@gmail\.com\r\n/);
    expect(decoded).not.toMatch(/\r\nBcc:/);
    expect(decoded).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(decoded).toMatch(/Content-Type: text\/plain; charset="UTF-8"/);
    expect(decoded).toMatch(/Content-Transfer-Encoding: base64/);
  });
});
