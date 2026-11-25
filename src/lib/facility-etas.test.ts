import { describe, expect, it } from "vitest";
import { estimateTravelTimes, formatEtaLabel, withFacilityEtas } from "./facility-etas";

describe("facility ETAs", () => {
  it("estimates drive and walk minutes from distance", () => {
    expect(estimateTravelTimes(5)).toEqual({ drive_min: 12, walk_min: 67 });
    expect(estimateTravelTimes(null)).toEqual({ drive_min: null, walk_min: null });
  });

  it("formats labels and enriches facility rows", () => {
    expect(formatEtaLabel(2)).toMatch(/2 km/);
    expect(formatEtaLabel(2)).toMatch(/min drive/);
    const rows = withFacilityEtas([{ name: "CPS", distance_km: 1.2, open_now: true }]);
    expect(rows[0].eta_label).toMatch(/1\.2 km/);
    expect(rows[0].drive_min).toBeGreaterThan(0);
  });
});
