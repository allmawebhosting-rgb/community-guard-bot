import { expect, test } from "vitest";
import { dedupeSseLine } from "./cloudflare-ai.server";
test("strips duplicate response", () => {
  const out = dedupeSseLine('data: {"response":"Po","choices":[{"delta":{"content":"Po"}}]}');
  expect(out).not.toContain('"response"');
  expect(out).toContain('"content":"Po"');
});
