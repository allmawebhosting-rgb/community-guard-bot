import { describe, expect, it } from "vitest";
import {
  getNearestUgandaPlace,
  getUgandaPlaceSuggestions,
  resolveUgandaPlace,
} from "@/lib/uganda-places";

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

  it("labels a live fix with a nearby gazetteer area without claiming an exact address", () => {
    expect(getNearestUgandaPlace({ lat: 0.3151, lng: 32.5817 })).toMatchObject({
      name: "Kampala Central",
      district: "Kampala",
    });
  });

  it("does not invent a nearby area for a distant or invalid location", () => {
    expect(getNearestUgandaPlace({ lat: 10, lng: 10 })).toBeNull();
    expect(getNearestUgandaPlace({ lat: Number.NaN, lng: 32.58 })).toBeNull();
  });
});
