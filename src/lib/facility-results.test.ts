import { describe, expect, it } from "vitest";
import { filterAndDedupe, refineFacilities } from "./facility-results";

const base = { phone: null, latitude: 0.4244, longitude: 33.2042 };
describe("facility results", () => {
  it("a police search keeps only police places", () => {
    const out = filterAndDedupe([
      { ...base, id: "1", name: "Jinja Central Police Station", type: "police", distance_m: 300 },
      { ...base, id: "2", name: "Jinja Regional Referral Hospital", type: "hospital", distance_m: 200 },
      { ...base, id: "3", name: "Jinja Fire Station", type: "fire_station", distance_m: 100 },
    ], "police");
    expect(out.map((p) => p.id)).toEqual(["1"]);
    expect(out[0].type_label).toBe("Police");
  });
  it("the same station listed twice is shown once, closest kept", () => {
    const out = filterAndDedupe([
      { ...base, id: "far", name: "Jinja Central Police Station", type: "police", distance_m: 900, address: "A" },
      { ...base, id: "near", name: "Jinja Central Police Station", type: "police", distance_m: 400, address: "B" },
    ], "police");
    expect(out.map((p) => p.id)).toEqual(["near"]);
  });

  it("combines requested types into one result set and resolves phones once", async () => {
    const places = [
      { ...base, id: "police", name: "Jinja Central Police Station", type: "police", distance_m: 300 },
      { ...base, id: "hospital", name: "Jinja Regional Referral Hospital", type: "hospital", distance_m: 500 },
      { ...base, id: "pharmacy", name: "Jinja Pharmacy", type: "pharmacy", distance_m: 100 },
    ];
    let phoneLookups = 0;
    const out = await refineFacilities(
      places,
      ["police", "hospital"],
      async () => {
        phoneLookups += 1;
        return {};
      },
      { emergency: true },
    );
    expect(out.map((place) => place.id)).toEqual(["police", "hospital"]);
    expect(phoneLookups).toBe(1);
  });
});
