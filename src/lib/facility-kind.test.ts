import { describe, expect, it } from "vitest";
import { facilityKind } from "@/lib/facility-kind";

describe("facilityKind", () => {
  it("classifies community health centres as clinics even when mapped as hospitals", () => {
    expect(facilityKind("hospital", "Bugembe Health Centre IV")).toBe("clinic");
    expect(facilityKind("hospital", "Case Medical Centre")).toBe("clinic");
    expect(facilityKind("medical_clinic", "Jinja Medical Clinic")).toBe("clinic");
  });

  it("keeps hospitals distinct from clinics and recognizes pharmacy names", () => {
    expect(facilityKind("hospital", "Jinja Regional Referral Hospital")).toBe("hospital");
    expect(facilityKind("pharmacy", "Guardian Health Pharmacy")).toBe("pharmacy");
    expect(facilityKind("chemist", "Town Chemist")).toBe("pharmacy");
  });
});
