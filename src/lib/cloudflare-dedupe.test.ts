import { expect, test } from "vitest";
import { dedupeSseLine } from "./cloudflare-ai.server";
test("strips duplicate response", () => {
  const out = dedupeSseLine('data: {"response":"Po","choices":[{"delta":{"content":"Po"}}]}');
  expect(out).not.toContain('"response"');
  expect(out).toContain('"content":"Po"');
});

test("strips duplicate tool calls when choices are present", () => {
  const out = dedupeSseLine(
    'data: {"response":"Po","tool_calls":[{"id":"call-1"}],"choices":[{"delta":{"content":"Po"}}]}',
  );
  expect(out).not.toContain('"response"');
  expect(out).not.toContain('"tool_calls"');
  expect(out).toContain('"content":"Po"');
});

test("preserves tool calls when choices are absent", () => {
  const line = 'data: {"tool_calls":[{"id":"call-1"}]}';
  expect(dedupeSseLine(line)).toBe(line);
});
