import { afterEach, describe, expect, it, vi } from "vitest";
import { executeGoogleSearch, normalizeResults } from "./google-search.server";

const KEYS = ["SERPER_API_KEY", "GOOGLE_SEARCH_API_KEY", "GOOGLE_SEARCH_ENGINE_ID", "TAVILY_API_KEY"];

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
  vi.unstubAllGlobals();
});

describe("normalizeResults", () => {
  it("keeps only http(s) links, removes duplicates and fills the source host", () => {
    const rows = normalizeResults(
      [
        { title: "A", link: "https://www.example.org/a", snippet: "one" },
        { title: "A again", link: "https://www.example.org/a", snippet: "dup" },
        { title: "Bad", link: "javascript:alert(1)", snippet: "x" },
        { title: "", link: "https://example.org/empty" },
        { title: "B", url: "http://news.test/b", content: "two", date: "2 hours ago" },
      ],
      5,
    );
    expect(rows).toEqual([
      { title: "A", link: "https://www.example.org/a", snippet: "one", source: "example.org", publishedDate: undefined },
      { title: "B", link: "http://news.test/b", snippet: "two", source: "news.test", publishedDate: "2 hours ago" },
    ]);
  });
});

describe("executeGoogleSearch", () => {
  it("reports SEARCH_NOT_CONFIGURED without any key", async () => {
    const res = await executeGoogleSearch("uganda news");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/^SEARCH_NOT_CONFIGURED/);
  });

  it("uses Serper with a Uganda country bias", async () => {
    process.env.SERPER_API_KEY = "k";
    const fetchMock = vi.fn(async () =>
      Response.json({
        organic: [{ title: "Result", link: "https://who.int/x", snippet: "text" }],
        answerBox: { answer: "42" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await executeGoogleSearch("who advisory");
    expect(res).toMatchObject({ success: true, answerBox: "42" });
    expect(res.results[0].source).toBe("who.int");
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body).toMatchObject({ q: "who advisory", gl: "ug", num: 5 });
  });

  it("falls back to Tavily when Serper fails", async () => {
    process.env.SERPER_API_KEY = "k";
    process.env.TAVILY_API_KEY = "t";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("serper")
          ? new Response("nope", { status: 500 })
          : Response.json({ answer: "yes", results: [{ title: "T", url: "https://t.test/1", content: "c" }] }),
      ),
    );
    const res = await executeGoogleSearch("anything");
    expect(res).toMatchObject({ success: true, answerBox: "yes" });
    expect(res.results).toHaveLength(1);
  });
});
