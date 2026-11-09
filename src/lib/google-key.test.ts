import { describe, expect, it } from "vitest";
import { resolveGoogleMapsKey } from "./places.server";

describe("resolveGoogleMapsKey", () => {
  it("ignores lovc_ connector placeholders and uses the real AIza key", () => {
    expect(
      resolveGoogleMapsKey({
        GOOGLE_MAPS_API_KEY: "lovc_abc",
        VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY: "AIzaReal",
      }),
    ).toBe("AIzaReal");
  });
});
