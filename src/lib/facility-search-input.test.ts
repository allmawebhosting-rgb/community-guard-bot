import { describe, expect, it } from "vitest";
import {
  categoriesToFacilityTypes,
  facilitySearchInputSchema,
  normalizeFacilityType,
} from "./facility-search-input";

describe("facility search tool input", () => {
  it("normalizes common model variants to supported facility types", () => {
    expect(normalizeFacilityType("police post")).toBe("police");
    expect(normalizeFacilityType("fire brigade")).toBe("fire");
    expect(normalizeFacilityType("ambulance service")).toBe("ambulance");
    expect(normalizeFacilityType("safe house")).toBe("shelter");
    expect(normalizeFacilityType("clinic")).toBe("hospital");
    expect(normalizeFacilityType("24/7 pharmacy")).toBe("pharmacy");
  });

  it("defaults missing and malformed facility types to police and hospitals", () => {
    expect(facilitySearchInputSchema.parse({})).toEqual({
      facility_types: ["police", "hospital"],
      categories: null,
      area: null,
      open_now_only: true,
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

  it("maps categories[] into facility_types for multi-resource search", () => {
    expect(
      facilitySearchInputSchema.parse({
        categories: ["pharmacy", "fire_station", "hospital"],
      }).facility_types,
    ).toEqual(["pharmacy", "fire", "hospital"]);
    expect(categoriesToFacilityTypes(["police", "ambulance"])).toEqual(["police", "ambulance"]);
  });

  it("defaults open_now_only for pharmacy/hospital searches", () => {
    expect(facilitySearchInputSchema.parse({ facility_types: ["pharmacy"] }).open_now_only).toBe(
      true,
    );
    expect(
      facilitySearchInputSchema.parse({ facility_types: ["police"], open_now_only: false })
        .open_now_only,
    ).toBe(false);
  });

  it("trims named areas and treats blank, vague, or non-string areas as absent", () => {
    expect(facilitySearchInputSchema.parse({ area: "  Jinja  " }).area).toBe("Jinja");
    expect(facilitySearchInputSchema.parse({ area: "  " }).area).toBeNull();
    expect(facilitySearchInputSchema.parse({ area: "nearby" }).area).toBeNull();
    expect(facilitySearchInputSchema.parse({ area: " near me " }).area).toBeNull();
    expect(facilitySearchInputSchema.parse({ area: "HERE" }).area).toBeNull();
    expect(facilitySearchInputSchema.parse({ area: 12 }).area).toBeNull();
  });
});
