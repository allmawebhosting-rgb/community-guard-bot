import { describe, expect, it } from "vitest";
import { shouldShowToolOutput } from "./chat-emergency-view";

describe("shouldShowToolOutput web_search", () => {
  it("shows source chips only when there are results", () => {
    expect(shouldShowToolOutput("tool-web_search", { results: [{ title: "A", link: "https://a.test" }] })).toBe(true);
    expect(shouldShowToolOutput("tool-web_search", { ok: false, results: [] })).toBe(false);
    expect(shouldShowToolOutput("tool-web_search", undefined)).toBe(false);
  });
});
