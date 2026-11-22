import { describe, expect, it } from "vitest";
import { ALLMA_EMERGENCY_PLAYBOOK, INCIDENTS, firstAidFor, matchIncident, playbookPromptFor } from "./allma-emergency-playbook";
import { dedupeRepeatedParts, normalizeChatMarkdown, parseAllmaMarkers } from "./allma-markers";
import { cleanAddress, filterAndDedupe } from "./facility-results";
import { firstAidFallback, incidentForReply, messageHasPlaces, preferredFirstAid, shouldRenderToolCard, shouldShowToolOutput, stripDuplicateFirstAidProse } from "./chat-emergency-view";
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

  it.each(["my nose is swollen", "I hit my nose", "I have a broken nose", "my nose looks swollen"])(
    "'%s' → swollen nose",
    (text) => {
      expect(matchIncident(text)?.id).toBe("swollen_nose");
    },
  );

  it("swollen nose first aid includes steps and urgent red flags", () => {
    const incident = matchIncident("my nose is swollen")!;
    expect(incident.category).toBe("medical");
    expect(incident.marker).toBe("medical");
    expect(incident.helpTypes).toEqual(["hospital"]);
    expect(incident.followUp).toBe("Are you having trouble breathing or any bleeding?");
    const aid = firstAidFor(incident)!;
    expect(aid.steps.join(" ")).toMatch(/sit upright/i);
    expect(aid.steps.join(" ")).toMatch(/cold compress/i);
    expect(aid.steps.join(" ")).toMatch(/do not blow/i);
    expect(aid.redFlags.join(" ")).toMatch(/trouble breathing/i);
    expect(aid.redFlags.join(" ")).toMatch(/heavy bleeding/i);
  });

  it("nose pain gets the swollen-nose first-aid fallback", () => {
    const incident = matchIncident("My nose hurts");
    expect(incident?.id).toBe("swollen_nose");
    expect(firstAidFallback(incident, "")?.steps.join(" ")).toMatch(/cold compress/i);
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
    expect(firstAidFallback(incident, "")).not.toBeNull();
    expect(firstAidFallback(incident, "1. Sit up\n2. Lean forward")).toBeNull();
    expect(firstAidFallback(null, "Here are hospitals.")).toBeNull();
  });

  it("preferred playbook card strips duplicate model first-aid prose", () => {
    const incident = matchIncident("my nose is bleeding");
    expect(preferredFirstAid(incident)?.steps.join(" ")).toMatch(/pinch|lean forward/i);
    const raw =
      "1. Sit up straight and lean forward.\n2. Apply pressure.\n\nGet help now if:\n- Still bleeding\n\nAllma isn't a doctor — if it gets worse, get medical help right away.\n\nDid the bleeding stop?\n\nHere are Uganda's emergency numbers:\n\n- Police 999\n- Toll-free emergency 112";
    const cleaned = stripDuplicateFirstAidProse(raw, incident);
    expect(cleaned).not.toMatch(/Sit up straight/);
    expect(cleaned).not.toMatch(/emergency numbers/i);
    expect(cleaned).not.toMatch(/Did the bleeding stop/i);
    expect(cleaned).not.toMatch(/isn't a doctor/i);
  });

  it("strips the red-flag block when the heading is bold with the colon inside", () => {
    // The playbook tells the model to write "**Get help now if:**" — the
    // colon inside the bold markers used to defeat the strip regex, so the
    // red flags showed twice: once in the text, once in the card.
    const incident = matchIncident("my nose is bleeding");
    const raw =
      "I am sorry your nose is bleeding. Do this now:\n\n1. Sit up and lean forward.\n2. Pinch the soft part of your nose for 10 to 15 minutes.\n\n**Get help now if:**\n- It is still bleeding after 20 minutes\n- You feel dizzy or faint\n\nDid the bleeding stop?";
    const cleaned = stripDuplicateFirstAidProse(raw, incident);
    expect(cleaned).not.toMatch(/Get help now if/);
    expect(cleaned).not.toMatch(/still bleeding after 20 minutes/);
    expect(cleaned).not.toMatch(/Sit up and lean forward/);
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
    expect(incidentForReply([user("my head is hurt"), bot("…")], 1)?.id).toBe("head_injury");
    expect(
      incidentForReply([user("my head is hurt"), bot("What's hurting?"), user("Yes"), bot("…")], 3)?.id,
    ).toBe("head_injury");
  });
});

describe("internal tool cards", () => {
  it("hides internal first-aid calls instead of showing duplicate Done cards", () => {
    expect(shouldRenderToolCard("tool-PHYSICAL_FIRSTAID")).toBe(false);
    expect(shouldRenderToolCard("tool-suggest_replies")).toBe(false);
    expect(shouldRenderToolCard("tool-find_facilities")).toBe(true);
  });

  it("hides empty report_summary Done cards", () => {
    expect(shouldShowToolOutput("report_summary", { ok: true })).toBe(false);
    expect(shouldShowToolOutput("report_summary", { ok: false, error: "rejected" })).toBe(false);
    expect(
      shouldShowToolOutput("report_summary", {
        ok: true,
        title: "Phone stolen",
        summary: "Phone taken near the market last night.",
      }),
    ).toBe(true);
  });

  it("hides empty or unrelated Case Timeline cards", () => {
    expect(shouldShowToolOutput("tool-case_timeline", { ok: true, events: [] })).toBe(false);
    expect(
      shouldShowToolOutput("tool-case_timeline", {
        ok: true,
        events: [{ label: "Location received" }],
      }),
    ).toBe(true);
  });

  it("hides empty list_alerts Nearby Help stubs", () => {
    expect(shouldShowToolOutput("list_alerts", { alerts: [] })).toBe(false);
    expect(shouldShowToolOutput("list_alerts", { alerts: [{ title: "Flood warning" }] })).toBe(true);
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
  it("drops a block repeated within a single part", () => {
    const steps = "1. Don't confront them\n2. Go to a room you can lock";
    const [out] = dedupeRepeatedParts([`${steps}\n\n${steps}`]);
    expect(out.match(/Go to a room you can lock/g)).toHaveLength(1);
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
