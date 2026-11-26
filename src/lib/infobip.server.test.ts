import { describe, expect, it } from "vitest";
import {
  cleanInfobipApiKey,
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

import { normalizeInfobipBaseUrl as normBase } from "@/lib/infobip.server";
describe("normalizeInfobipBaseUrl", () => {
  it("adds https:// when missing", () => {
    expect(normBase("z4z2mx.api.infobip.com")).toBe("https://z4z2mx.api.infobip.com");
  });
  it("keeps full URL and strips trailing slash", () => {
    expect(normBase("https://abc.api.infobip.com/")).toBe("https://abc.api.infobip.com");
  });
});

describe("cleanInfobipApiKey", () => {
  it("removes the App scheme, quotes and spaces that break the Authorization header", () => {
    expect(cleanInfobipApiKey("App abc123")).toBe("abc123");
    expect(cleanInfobipApiKey(' "app abc123" ')).toBe("abc123");
    expect(cleanInfobipApiKey("Authorization: App abc123")).toBe("abc123");
    expect(cleanInfobipApiKey("abc123")).toBe("abc123");
    expect(cleanInfobipApiKey(undefined)).toBe("");
  });
});
