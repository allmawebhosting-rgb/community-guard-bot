import { describe, expect, it } from "vitest";
import {
  buildRawMessage,
  decryptToken,
  encryptToken,
  signOAuthState,
  verifyOAuthState,
} from "./gmail-connection.server";

function decodeRaw(raw: string) {
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

describe("gmail connection helpers", () => {
  it("round-trips an encrypted refresh token and rejects the wrong key", async () => {
    const blob = await encryptToken("1//refresh-token", "key-a");
    expect(blob).not.toContain("refresh-token");
    expect(await decryptToken(blob, "key-a")).toBe("1//refresh-token");
    await expect(decryptToken(blob, "key-b")).rejects.toThrow();
  });

  it("signs OAuth state that expires and cannot be tampered with", async () => {
    const now = 1_000_000;
    const state = await signOAuthState({ userId: "u1", origin: "https://allmasafetyai.online" }, now, "k");
    expect(await verifyOAuthState(state, now + 1000, "k")).toEqual({
      userId: "u1",
      origin: "https://allmasafetyai.online",
    });
    expect(await verifyOAuthState(state, now + 11 * 60 * 1000, "k")).toBeNull();
    expect(await verifyOAuthState(state, now, "other")).toBeNull();
    const [body, sig] = state.split(".");
    expect(await verifyOAuthState(`${body}x.${sig}`, now, "k")).toBeNull();
  });

  it("builds a MIME message from the user's address without header injection", () => {
    const raw = buildRawMessage({
      from: "me@gmail.com",
      to: "clinic@example.com\r\nBcc: evil@example.com",
      subject: "Help needed — Jinja",
      text: "Dear team,\nPlease help.",
    });
    const decoded = decodeRaw(raw);
    expect(decoded).toMatch(/^From: me@gmail\.com\r\n/);
    expect(decoded).not.toMatch(/\r\nBcc:/);
    expect(decoded).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(decoded).toMatch(/Content-Transfer-Encoding: base64/);
  });
});
