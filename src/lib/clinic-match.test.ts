import { describe, expect, it } from "vitest";
import { isSameClinic, pickRequestedClinic } from "./clinic-match";

describe("clinic matching", () => {
  it("rejects a similar-sounding but different clinic", () => {
    expect(isSameClinic("Jemia Doctors Chambers", "Kampala Medical Chambers Hospital")).toBe(false);
  });
  it("accepts the clinic the user named", () => {
    expect(isSameClinic("Jemia Doctors Chambers", "Jemia Doctors Chambers Ltd")).toBe(true);
    expect(isSameClinic("jinja main hospital", "Jinja Regional Referral Hospital")).toBe(true);
    expect(isSameClinic("Nakasero hospital", "Nakasero Hospital Kampala")).toBe(true);
  });
  it("picks the right one from several results", () => {
    const places = [{ name: "Kampala Medical Chambers Hospital" }, { name: "Jemia Doctors Chambers" }];
    expect(pickRequestedClinic("Jemia Doctors Chambers", places)?.name).toBe("Jemia Doctors Chambers");
    expect(pickRequestedClinic("Jemia Doctors Chambers", [places[0]])).toBeNull();
  });
});
