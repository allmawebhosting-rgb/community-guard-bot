import { describe, expect, it } from "vitest";
import {
  CENTRAL_KAMPALA,
  applyFacilityDistances,
  distanceFromLabel,
  formatKm,
  haversineKm,
  toFiniteNumber,
  validLatLng,
} from "./facility-distance";

describe("facility distance", () => {
  it("never turns missing values into coordinates", () => {
    expect(toFiniteNumber(null)).toBeNull();
    expect(toFiniteNumber("")).toBeNull();
    expect(toFiniteNumber("0.33")).toBe(0.33);
    expect(validLatLng(null, 32.5)).toBeNull();
    expect(validLatLng(0, 0)).toBeNull();
    expect(validLatLng("0.3476", "32.5825")).toEqual({ lat: 0.3476, lng: 32.5825 });
  });

  it("measures real haversine distance (Central Kampala → Mulago ≈ 2.6 km)", () => {
    const km = haversineKm(CENTRAL_KAMPALA, { lat: 0.3376, lng: 32.576 });
    expect(km).toBeGreaterThan(2.5);
    expect(km).toBeLessThan(3.2);
  });

  it("formats small distances in metres, not 0 km", () => {
    expect(formatKm(0.004)).toBe("<50 m");
    expect(formatKm(0.35)).toBe("350 m");
    expect(formatKm(1.44)).toBe("1.4 km");
    expect(formatKm(null)).toBeNull();
    expect(formatKm(Number.NaN)).toBeNull();
  });

  it("recomputes and sorts by real distance, ignoring bogus upstream 0 values", () => {
    const rows = applyFacilityDistances(
      [
        { name: "Far", latitude: "0.4", longitude: "32.7", distance_km: 0 },
        { name: "Near", latitude: 0.3163, longitude: 32.5822, distance_km: 0 },
        { name: "No coords", latitude: null, longitude: null, distance_km: 0 },
      ],
      CENTRAL_KAMPALA,
    );
    expect(rows.map((r) => r.name)).toEqual(["Near", "Far", "No coords"]);
    expect(rows[0].distance_km).toBeGreaterThan(0);
    expect(rows[1].distance_km).toBeGreaterThan(rows[0].distance_km as number);
    expect(rows[2].distance_km).toBeNull();
  });

  it("drops distances when there is no origin", () => {
    const rows = applyFacilityDistances([{ name: "A", latitude: 0.33, longitude: 32.57, distance_km: 0 }], null);
    expect(rows[0].distance_km).toBeNull();
  });

  it("labels the fallback centre", () => {
    expect(distanceFromLabel("fallback")).toBe("from Central Kampala");
    expect(distanceFromLabel("named", "Jinja, Jinja")).toBe("from Jinja");
    expect(distanceFromLabel("gps")).toBeNull();
  });
});
