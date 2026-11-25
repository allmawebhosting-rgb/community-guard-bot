import { describe, expect, it } from "vitest";
import {
  isOfficialEmergencyNumber,
  normalizeUgandanPhone,
} from "@/lib/africas-talking.server";

describe("Africa's Talking phone normalization", () => {
  it("formats Ugandan mobiles to E.164 and blocks official short codes", () => {
    expect(normalizeUgandanPhone("0774620951")).toBe("+256774620951");
    expect(normalizeUgandanPhone("256774620951")).toBe("+256774620951");
    expect(normalizeUgandanPhone("+256774620951")).toBe("+256774620951");
    expect(normalizeUgandanPhone("999")).toBeNull();
    expect(normalizeUgandanPhone("112")).toBeNull();
    expect(normalizeUgandanPhone("911")).toBeNull();
    expect(isOfficialEmergencyNumber("999")).toBe(true);
  });

  it("preserves sandbox international test numbers", () => {
    expect(normalizeUgandanPhone("+254711082189", { sandbox: true })).toBe("+254711082189");
    expect(normalizeUgandanPhone("254711082189", { sandbox: true })).toBe("+254711082189");
  });
});
