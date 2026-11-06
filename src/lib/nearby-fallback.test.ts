import { describe, expect, it } from "vitest";
import { getSeededNearbyFacilities } from "@/lib/nearby-fallback";

describe("getSeededNearbyFacilities", () => {
  it("returns nearby Kampala facilities in distance order", () => {
    const facilities = getSeededNearbyFacilities({ lat: 0.3152, lng: 32.5816 });

    expect(facilities.length).toBeGreaterThan(3);
    expect(facilities[0].name).toBe("Central Police Station Kampala");
    expect(facilities.every((facility) => facility.distance_m <= 10_000)).toBe(true);
  });

  it("uses the same national seed directory outside Kampala", () => {
    const facilities = getSeededNearbyFacilities({ lat: 0.4395, lng: 33.2026 }, 1_000);

    expect(facilities.map((facility) => facility.name)).toContain("Jinja Central Police Station");
    expect(facilities.map((facility) => facility.name)).not.toContain(
      "Central Police Station Kampala",
    );
  });

  it("returns no seed entries outside the configured radius", () => {
    expect(getSeededNearbyFacilities({ lat: 0.3152, lng: 32.5816 }, 100)).toHaveLength(0);
  });
});
