import { describe, expect, it } from "vitest";
import { withTimeoutFallback } from "./async-timeout";

describe("withTimeoutFallback", () => {
  it("returns the value when it arrives in time", async () => {
    await expect(withTimeoutFallback(Promise.resolve(7), 50, 0)).resolves.toBe(7);
  });

  it("returns the fallback when the promise is slow", async () => {
    const slow = new Promise<number>((resolve) => setTimeout(() => resolve(1), 50));
    await expect(withTimeoutFallback(slow, 5, 99)).resolves.toBe(99);
  });

  it("returns the fallback when the promise rejects", async () => {
    await expect(withTimeoutFallback(Promise.reject(new Error("nope")), 50, "safe")).resolves.toBe("safe");
  });
});
