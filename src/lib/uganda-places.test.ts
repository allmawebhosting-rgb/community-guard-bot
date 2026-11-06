import { describe, expect, it } from "vitest";
import { getUgandaPlaceSuggestions, resolveUgandaPlace } from "@/lib/uganda-places";

describe("Uganda place search", () => {
  it("suggests matching suburbs and roads", () => {
    expect(getUgandaPlaceSuggestions("Jinja Roa")).toContainEqual(
      expect.objectContaining({ name: "Jinja Road", district: "Kampala" }),
    );
  });

  it("resolves a typed place to its approximate search centre", () => {
    expect(resolveUgandaPlace("near Kampala Central")).toMatchObject({
      name: "Kampala Central",
      district: "Kampala",
      lat: 0.3152,
      lng: 32.5816,
    });
  });
});
