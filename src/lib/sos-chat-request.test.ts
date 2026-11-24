import { afterEach, describe, expect, it } from "vitest";
import {
  consumeSosChatStart,
  markSosChatStart,
  peekSosChatStart,
  SOS_CHAT_START_TTL_MS,
} from "./sos-chat-request";

afterEach(() => {
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("sos-chat-request", () => {
  it("marks and consumes a fresh header SOS start", () => {
    const now = 1_000_000;
    markSosChatStart(now);
    expect(peekSosChatStart(now + 1_000)).toBe(true);
    expect(consumeSosChatStart(now + 1_000)).toBe(true);
    expect(peekSosChatStart(now + 1_000)).toBe(false);
  });

  it("expires after the TTL", () => {
    const now = 1_000_000;
    markSosChatStart(now);
    expect(consumeSosChatStart(now + SOS_CHAT_START_TTL_MS + 1)).toBe(false);
  });
});
