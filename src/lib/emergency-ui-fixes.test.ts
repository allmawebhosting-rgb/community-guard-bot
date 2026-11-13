import { describe, expect, it } from "vitest";
import { ALLMA_EMERGENCY_PLAYBOOK, INCIDENTS, firstAidFor, matchIncident, playbookPromptFor } from "./allma-emergency-playbook";
import { dedupeRepeatedParts, normalizeChatMarkdown, parseAllmaMarkers } from "./allma-markers";
import { cleanAddress, filterAndDedupe } from "./facility-results";
import { firstAidFallback, incidentForReply, messageHasPlaces } from "./chat-emergency-view";
import { EMERGENCY_NUMBERS } from "./allma";

const user = (text: string) => ({ role: "user", parts: [{ type: "text", text }] });
const bot = (text: string) => ({ role: "assistant", parts: [{ type: "text", text }] });

describe("nosebleed and other incidents always get the playbook", () => {
  it.each([
    "My nose is bleeding and it won't stop. I'm in Jinja",
    "my nose keeps bleeding",
    "nosebleed that won't stop",
    "nose-bleed",
    "my son's nose is bleeding",
    "bleeding from my nose",
    "blood is coming out of my nose",
    "I have a bloody nose",
  ])("'%s' → nosebleed", (text) => {
    expect(matchIncident(text)?.id).toBe("nosebleed");
  });

  it("nosebleed first aid has steps, red flags and the not-a-doctor line", () => {
    const aid = firstAidFor(matchIncident("my nose is bleeding")!)!;
    expect(aid.steps.length).toBeGreaterThanOrEqual(3);
    expect(aid.steps.length).toBeLessThanOrEqual(6);
    expect(aid.steps[0]).toMatch(/lean forward/i);
    expect(aid.redFlags.length).toBeGreaterThan(0);
    expect(aid.notDoctor).toMatch(/isn't a doctor/);
  });

  it("every incident with 'Steps:' parses into 1–6 clean steps", () => {
    for (const incident of INCIDENTS) {
      const aid = firstAidFor(incident);
      if (!/Steps:/.test(incident.guide)) continue;
      expect(aid, incident.id).not.toBeNull();
      expect(aid!.steps.length, incident.id).toBeGreaterThan(0);
      expect(aid!.steps.length, incident.id).toBeLessThanOrEqual(6);
      for (const s of aid!.steps) expect(s.length, incident.id).toBeGreaterThan(2);
    }
  });

  it("break-in still maps to police and keeps its own steps", () => {
    const aid = firstAidFor(matchIncident("someone is breaking into my house")!)!;
    expect(aid.steps.some((s) => /lock/i.test(s))).toBe(true);
    expect(aid.notDoctor).toBeNull();
  });

  it("fallback steps appear only when the reply has no numbered steps", () => {
    const incident = matchIncident("my nose is bleeding");
    expect(firstAidFallback(incident, "Here are hospitals near Jinja.")).not.toBeNull();
    expect(firstAidFallback(incident, "1. Sit up\n2. Lean forward")).toBeNull();
    expect(firstAidFallback(null, "Here are hospitals.")).toBeNull();
  });
});

describe("SOS only for described emergencies", () => {
  it("a plain facility search is not an incident", () => {
    for (const text of ["Find the nearest hospital.", "nearest police station", "Where is the nearest fire station?", "blood bank near me"]) {
      expect(incidentForReply([user(text), bot("…")], 1), text).toBeNull();
    }
  });
  it("a described emergency is an incident for the reply", () => {
    expect(incidentForReply([user("someone is breaking into my house"), bot("…")], 1)?.id).toBe("break_in");
    expect(incidentForReply([user("there is a fire in our house"), bot("…")], 1)?.id).toBe("fire");
  });
});

describe("no 911 anywhere user-facing", () => {
  it("playbook prompt never offers a Call 911 button", () => {
    expect(ALLMA_EMERGENCY_PLAYBOOK).not.toMatch(/Call 911|Ambulance 911/);
    expect(playbookPromptFor(matchIncident("my nose is bleeding")!)).not.toMatch(/Call 911|Ambulance 911/);
  });
  it("model text saying 911 is shown as 999", () => {
    expect(parseAllmaMarkers("Call 911 now.").text).toContain("999");
    expect(parseAllmaMarkers("Call 911 now.").text).not.toContain("911");
  });
  it("dashboard numbers have no 911", () => {
    expect(EMERGENCY_NUMBERS.some((n) => n.number === "911")).toBe(false);
  });
});

describe("numbers one per line", () => {
  it("splits a bullet holding two numbers", () => {
    const out = normalizeChatMarkdown("- 📞 0800 199 699 📞 Or call 999");
    const lines = out.split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^- 📞 0800 199 699$/);
    expect(lines[1]).toMatch(/^- 📞 Or call 999$/);
  });
  it("splits a plain line holding two numbers", () => {
    const lines = normalizeChatMarkdown("Police 999 Toll-free 112").split("\n").filter(Boolean);
    expect(lines).toEqual(["- Police 999", "- Toll-free 112"]);
  });
});

describe("repeated steps render once", () => {
  it("drops the second copy of steps and red flags", () => {
    const steps = "1. Don't confront them\n2. Go to a room you can lock\n\n**Get help now if:**\n- They are armed or inside the room";
    const [a, b] = dedupeRepeatedParts([steps, `${steps}\n\nThe closest is Jinja Central Police Station.`]);
    expect(a).toBe(steps);
    expect(b).not.toMatch(/Go to a room you can lock/);
    expect(b).not.toMatch(/Get help now if/);
    expect(b).toMatch(/closest is Jinja Central/);
  });
});

describe("place results", () => {
  const base = { phone: null, latitude: 0.4244, longitude: 33.2042 };
  it("emergency medical search drops pharmacies, dental and AIDS info centres", () => {
    const out = filterAndDedupe([
      { ...base, id: "1", name: "Jinja Regional Referral Hospital", type: "hospital", distance_m: 900 },
      { ...base, id: "2", name: "Bugembe Pharmacy", type: "pharmacy", distance_m: 100 },
      { ...base, id: "3", name: "Smile Dental Clinic", type: "dental_clinic", distance_m: 200 },
      { ...base, id: "4", name: "AIDS Information Centre Jinja", type: "medical_clinic", distance_m: 300 },
      { ...base, id: "5", name: "JEMIA DOCTORS CHAMBERS", type: "doctor", distance_m: 400 },
    ], "hospital", { emergency: true });
    expect(out.map((p) => p.id)).toEqual(["5", "1"]);
  });
  it("a plain hospital search still allows pharmacies", () => {
    const out = filterAndDedupe([
      { ...base, id: "2", name: "Bugembe Pharmacy", type: "pharmacy", distance_m: 100 },
    ], "hospital");
    expect(out.map((p) => p.id)).toEqual(["2"]);
  });
  it("a place Google calls 'hospital' without hospital in its name is not labelled Hospital", () => {
    const out = filterAndDedupe([
      { ...base, id: "1", name: "Nile Medicare", type: "hospital", distance_m: 100 },
      { ...base, id: "2", name: "Jinja Regional Referral Hospital", type: "hospital", distance_m: 200 },
    ], "hospital");
    expect(out[0].type_label).toBe("Health facility");
    expect(out[1].type_label).toBe("Hospital");
  });
  it("police search excludes vehicle inspection", () => {
    const out = filterAndDedupe([
      { ...base, id: "1", name: "Police Vehicle Inspection Jinja", type: "police", distance_m: 100 },
      { ...base, id: "2", name: "Jinja Central Police Station", type: "police", distance_m: 200 },
    ], "police");
    expect(out.map((p) => p.id)).toEqual(["2"]);
  });
  it("addresses: repeated words removed, wrong default Kampala dropped", () => {
    expect(cleanAddress("Bell Avenue Jinja jinja, Kampala", 0.4244, 33.2042)).toBe("Bell Avenue Jinja");
    expect(cleanAddress("Bell Avenue Jinja jinja, Kampala")).toBe("Bell Avenue Jinja");
    expect(cleanAddress("Kampala Road, Kampala", 0.3136, 32.5811)).toBe("Kampala Road, Kampala");
    expect(cleanAddress(null)).toBeNull();
  });
  it("blank phone counts as missing so it can be looked up", async () => {
    const { refineFacilities } = await import("./facility-results");
    const out = await refineFacilities(
      [{ ...base, id: "google:abc", name: "JEMIA DOCTORS CHAMBERS", type: "doctor", distance_m: 100, phone: " " as string | null }],
      "hospital",
      async (missing) => Object.fromEntries(missing.map((m) => [m.id, "0772 000000"])),
    );
    expect(out[0].phone).toBe("0772 000000");
  });
});

describe("no contradictory empty box", () => {
  it("detects that facility results were shown", () => {
    expect(messageHasPlaces([{ type: "tool-find_facilities", output: { facilities: [{ name: "X" }] } }])).toBe(true);
    expect(messageHasPlaces([{ type: "tool-find_facilities", output: { facilities: [] } }])).toBe(false);
  });
});
