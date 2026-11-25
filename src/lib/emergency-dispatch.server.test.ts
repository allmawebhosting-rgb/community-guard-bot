import { describe, expect, it } from "vitest";
import {
  buildSpokenDispatchScript,
  officialEmergencyNumber,
  prepareEmergencyDispatch,
} from "./emergency-dispatch.server";

describe("emergency dispatch bridge", () => {
  it("uses official Uganda numbers only", () => {
    expect(officialEmergencyNumber("police").number).toBe("999");
    expect(officialEmergencyNumber("police").secondary.some((s) => s.number === "112")).toBe(true);
    expect(officialEmergencyNumber("medical").number).toBe("911");
    expect(officialEmergencyNumber("fire").number).toBe("999");
  });

  it("builds a concise spoken operator script", () => {
    const script = buildSpokenDispatchScript({
      callerName: "Allan",
      locationText: "Bukoto near Kadic Hospital",
      situationBrief: "Severe nose swelling and trouble breathing after a fall.",
    });
    expect(script).toMatch(/My name is Allan/);
    expect(script).toMatch(/Bukoto near Kadic Hospital/);
    expect(script).toMatch(/Please send assistance immediately/);
  });

  it("never auto-dials and always returns tel-ready official numbers", async () => {
    const result = await prepareEmergencyDispatch({
      emergency_type: "police",
      user_location: { lat: 0.3152, lng: 32.5816, area_name: "Central Kampala" },
      situation_brief: "Armed robbery in progress near the market.",
      caller_name: "Air",
    });
    expect(result.ok).toBe(true);
    expect(result.auto_dialed).toBe(false);
    expect(result.official_number).toBe("999");
    expect(result.spoken_script).toMatch(/My name is Air/);
    expect(result.spoken_script).toMatch(/Central Kampala|Kampala/);
    expect(result.disclaimer).toMatch(/never auto-dials/i);
  });
});
