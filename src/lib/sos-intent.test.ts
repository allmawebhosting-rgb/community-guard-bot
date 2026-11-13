import { describe, it, expect, vi } from "vitest";
import { isSosIntentFresh, withTimeout } from "./sos-intent";

describe("sos intent", () => {
  it("a reload or shared link without a tap does not start SOS", () => {
    expect(isSosIntentFresh(null, 1000)).toBe(false);
  });
  it("a tap within 15 seconds starts SOS", () => {
    expect(isSosIntentFresh("1000", 1000 + 14_000)).toBe(true);
  });
  it("an old tap (from history) does not start SOS", () => {
    expect(isSosIntentFresh("1000", 1000 + 16_000)).toBe(false);
  });
  it("responder search gives up after 20 seconds", async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise<number[]>(() => {}), 20_000, []);
    vi.advanceTimersByTime(20_000);
    await expect(p).resolves.toEqual({ value: [], timedOut: true });
    vi.useRealTimers();
  });
});
