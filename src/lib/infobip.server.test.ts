import { describe, expect, it } from "vitest";
import {
  isOfficialEmergencyNumber,
  normalizeInfobipPhone,
} from "@/lib/infobip.server";

describe("Infobip phone normalization", () => {
  it("formats Ugandan numbers as digits without +", () => {
    expect(normalizeInfobipPhone("0774520951")).toBe("256774520951");
    expect(normalizeInfobipPhone("+256774520951")).toBe("256774520951");
    expect(normalizeInfobipPhone("256774520951")).toBe("256774520951");
  });

  it("blocks official short codes and short numbers", () => {
    expect(normalizeInfobipPhone("999")).toBeNull();
    expect(normalizeInfobipPhone("112")).toBeNull();
    expect(normalizeInfobipPhone("911")).toBeNull();
    expect(normalizeInfobipPhone("12345")).toBeNull();
    expect(isOfficialEmergencyNumber("999")).toBe(true);
  });
});
