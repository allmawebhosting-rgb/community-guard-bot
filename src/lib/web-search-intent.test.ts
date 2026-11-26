import { describe, expect, it } from "vitest";
import { buildSearchQuery, wantsWebSearch } from "./web-search-intent";

describe("wantsWebSearch", () => {
  it.each([
    "Search Google for the latest cholera advisory in Uganda",
    "What is the latest news in Kampala today?",
    "What time does Mulago hospital open on Sunday?",
    "Is the passport office in Entebbe open now?",
    "Any official advisory for travelling to Gulu this week?",
    "How do I renew my driving permit?",
    "what's the weather in Jinja tomorrow",
  ])("searches for %s", (text) => {
    expect(wantsWebSearch(text)).toBe(true);
  });

  it.each([
    "hi",
    "Find help nearby",
    "Where is the nearest hospital near me",
    "Book an appointment at Jemia Doctors Chambers",
    "Write them an email asking about visiting hours",
    "Someone is bleeding badly, help me",
    "I want to report a theft",
    "How do I stop a nosebleed? first aid",
    "Thank you so much",
  ])("does not search for %s", (text) => {
    expect(wantsWebSearch(text)).toBe(false);
  });
});

describe("buildSearchQuery", () => {
  it("drops the ask wrapper and keeps the topic", () => {
    expect(buildSearchQuery("Please search Google for the latest cholera advisory in Uganda?")).toBe(
      "the latest cholera advisory in Uganda",
    );
    expect(buildSearchQuery("Can you look up Mulago hospital visiting hours online")).toBe(
      "Mulago hospital visiting hours",
    );
    expect(buildSearchQuery("What is the weather in Jinja")).toBe("What is the weather in Jinja");
  });
});

import { searchFallbackText } from "./web-search-intent";

describe("searchFallbackText", () => {
  it("never guesses when search failed", () => {
    expect(searchFallbackText({ ok: false })).toMatch(/could not reach live search/);
    expect(searchFallbackText(null)).toMatch(/could not reach live search/);
  });

  it("summarizes the answer box and the top snippet", () => {
    const text = searchFallbackText({
      ok: true,
      answer: "Mulago opens 24 hours.",
      results: [{ snippet: "Open daily.", source: "mulago.go.ug" }],
    });
    expect(text).toContain("Mulago opens 24 hours.");
    expect(text).toContain("According to mulago.go.ug: Open daily.");
  });

  it("says so when nothing reliable was found", () => {
    expect(searchFallbackText({ ok: true, results: [] })).toMatch(/did not find anything reliable/);
  });
});
