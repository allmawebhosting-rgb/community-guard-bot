import { describe, expect, it } from "vitest";
import { facilitySearchInputSchema, normalizeFacilityType } from "./facility-search-input";

describe("facility search tool input", () => {
  it("normalizes common model variants to supported facility types", () => {
    expect(normalizeFacilityType("police post")).toBe("police");
    expect(normalizeFacilityType("fire brigade")).toBe("fire");
    expect(normalizeFacilityType("ambulance service")).toBe("ambulance");
    expect(normalizeFacilityType("safe house")).toBe("shelter");
    expect(normalizeFacilityType("clinic")).toBe("hospital");
  });

  it("defaults missing and malformed facility types to police and hospitals", () => {
    expect(facilitySearchInputSchema.parse({})).toEqual({
      facility_types: ["police", "hospital"],
      area: null,
    });
    expect(facilitySearchInputSchema.parse({ facility_types: 42 }).facility_types).toEqual([
      "police",
      "hospital",
    ]);
  });

  it("accepts one type or a loosely worded list without rejecting the call", () => {
    expect(facilitySearchInputSchema.parse({ facility_types: "fire service" }).facility_types).toEqual([
      "fire",
    ]);
    expect(
      facilitySearchInputSchema.parse({
        facility_types: ["ambulance", "safe place", "district police station"],
      }).facility_types,
    ).toEqual(["ambulance", "shelter", "police"]);
  });

  it("trims a supplied area and treats blank or non-string areas as absent", () => {
    expect(facilitySearchInputSchema.parse({ area: "  Jinja  " }).area).toBe("Jinja");
    expect(facilitySearchInputSchema.parse({ area: "  " }).area).toBeNull();
    expect(facilitySearchInputSchema.parse({ area: 12 }).area).toBeNull();
  });
});
