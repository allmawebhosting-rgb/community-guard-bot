import { describe, expect, it } from "vitest";
import { classifyEmergency, facilityFor, UGANDA_HOTLINES } from "./emergency-triage";

describe("emergency triage", () => {
  it("medical routes to hospital with ambulance 911", () => {
    expect(classifyEmergency("my friend is bleeding a lot")).toBe("medical");
    expect(facilityFor("medical")).toBe("hospital");
    expect(UGANDA_HOTLINES.medical[0].number).toBe("911");
  });
  it("violence routes to police 999", () => {
    expect(classifyEmergency("someone is following me with a knife")).toBe("violence");
    expect(facilityFor("violence")).toBe("police");
    expect(UGANDA_HOTLINES.violence[0].number).toBe("999");
  });
  it("fire routes to fire station", () => {
    expect(classifyEmergency("there is a fire in our house")).toBe("fire");
    expect(facilityFor("fire")).toBe("fire");
  });
  it("ordinary chat is not an emergency", () => {
    expect(classifyEmergency("hello how are you")).toBeNull();
  });
});
