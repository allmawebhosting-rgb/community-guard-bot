import { afterEach, describe, expect, it, vi } from "vitest";
import { findPublishedEmail, isPublicWebsite } from "./emergency-facilities.server";

describe("isPublicWebsite", () => {
  it("accepts public sites and rejects internal addresses", () => {
    expect(isPublicWebsite("https://jinjahospital.go.ug")).toBe(true);
    for (const bad of ["http://localhost/admin", "http://127.0.0.1", "http://10.0.0.5", "ftp://x.ug", "http://intranet", "http://[::1]/", "not a url"]) {
      expect(isPublicWebsite(bad)).toBe(false);
    }
  });
});

describe("findPublishedEmail", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads an email the facility publishes, and falls back to its contact page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const html = String(url).endsWith("/contact-us")
          ? "<p>Reach casualty: casualty@clinic.ug</p>"
          : '<a href="/contact-us">Contact</a>';
        return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
      }),
    );
    expect(await findPublishedEmail("https://clinic.ug")).toBe("casualty@clinic.ug");
  });

  it("returns null instead of guessing, and never fetches internal addresses", async () => {
    const fetchMock = vi.fn(async () => new Response("<p>No email here</p>", { status: 200, headers: { "content-type": "text/html" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await findPublishedEmail("https://clinic.ug")).toBeNull();
    fetchMock.mockClear();
    expect(await findPublishedEmail("http://169.254.169.254/")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
