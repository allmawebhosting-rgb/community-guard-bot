import { describe, expect, it } from "vitest";
import { classifyEmergency, classifyIncident, facilitiesFor, facilityFor, UGANDA_HOTLINES, EMERGENCY_BLOCK_LINES } from "./emergency-triage";

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
  it("road accident needs hospital AND police", () => {
    expect(classifyIncident("there was a road accident, a man is bleeding")?.id).toBe("road_accident");
    expect(facilitiesFor("boda boda crash near Jinja")).toEqual(["hospital", "police"]);
  });
  it("break-in maps to police", () => {
    expect(classifyIncident("there is a break-in at my house")?.id).toBe("break_in");
    expect(facilitiesFor("someone broke in")).toEqual(["police"]);
  });
  it("gas leak and building collapse go to fire", () => {
    expect(facilitiesFor("I smell gas, there is a gas leak")).toEqual(["fire"]);
    expect(facilitiesFor("a building collapsed")).toEqual(["fire", "hospital"]);
  });
  it("sexual assault needs hospital and police", () => {
    expect(facilitiesFor("I was raped")).toEqual(["hospital", "police"]);
  });
  it("nosebleed and heart attack are not mistaken for other incidents", () => {
    expect(classifyIncident("my nose is bleeding")?.id).toBe("nosebleed");
    expect(classifyIncident("I think he is having a heart attack")?.id).toBe("heart_attack");
  });
  it("emergency block uses Police 999, Toll-free 112, Ambulance 911 only for medical", () => {
    expect(EMERGENCY_BLOCK_LINES.crime.map((h) => h.number)).toEqual(["999", "112"]);
    expect(EMERGENCY_BLOCK_LINES.medical.map((h) => h.number)).toEqual(["999", "112", "911"]);
  });
});
