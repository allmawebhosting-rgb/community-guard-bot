import { describe, expect, it } from "vitest";
import {
  buildEmergencySms,
  buildVoiceScriptText,
  isOfficialEmergencyNumber,
  renderVoiceScriptXml,
  sanitizeDialList,
} from "@/lib/telecom-call.server";

describe("telecom emergency dial safeguards", () => {
  it("blocks official Uganda emergency short codes from auto-dial", () => {
    expect(isOfficialEmergencyNumber("999")).toBe(true);
    expect(isOfficialEmergencyNumber("112")).toBe(true);
    expect(isOfficialEmergencyNumber("911")).toBe(true);
    expect(isOfficialEmergencyNumber("+256999")).toBe(true);
    expect(isOfficialEmergencyNumber("0774620951")).toBe(false);
    expect(isOfficialEmergencyNumber("+256774620951")).toBe(false);
  });

  it("sanitizes dial list: normalize UG numbers, drop short codes, dedupe", () => {
    const list = sanitizeDialList([
      { name: "Mum", phone: "0774620951" },
      { name: "Mum dup", phone: "+256774620951" },
      { name: "Police", phone: "999" },
      { name: "Toll", phone: "112" },
      { name: "Bad", phone: "12" },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]?.e164).toBe("+256774620951");
    expect(list[0]?.name).toBe("Mum");
  });

  it("builds voice + SMS copy without inventing confirmation codes", () => {
    const voice = buildVoiceScriptText({
      callerName: "Aisha",
      emergencyType: "assault",
      locationText: "Jinja Road",
    });
    expect(voice).toMatch(/Emergency alert from Aisha/);
    expect(voice).toMatch(/Press 1 to confirm/);

    const sms = buildEmergencySms({
      callerName: "Aisha",
      emergencyType: "assault",
      locationText: "Jinja Road",
      activityId: "11111111-1111-1111-1111-111111111111",
    });
    expect(sms).toMatch(/^EMERGENCY: Aisha activated an SOS/);
    expect(sms).toMatch(/\/sos\?id=11111111-1111-1111-1111-111111111111/);
    expect(sms).not.toMatch(/\+256/);
  });

  it("escapes XML for TTS scripts", () => {
    const xml = renderVoiceScriptXml("twilio", 'Alert from Tom & "Jerry" <test>');
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;test&gt;");
    expect(xml).toContain("<Say");
  });
});
