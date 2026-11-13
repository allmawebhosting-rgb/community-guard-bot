import { describe, expect, it } from "vitest";
import { chooseSearchOrigin } from "./location-origin";
import { mentionsUgandaPlace } from "./uganda-places";
import { facilitiesFromLocationIntel, stripFillerSentences } from "./chat-emergency-view";
import { ALLMA_EMERGENCY_PLAYBOOK } from "./allma-emergency-playbook";
import { ALLMA_LOCATION_BLOCK, ALLMA_SYSTEM_PROMPT } from "./allma-prompt";

const BUGEMBE = { latitude: 0.4686, longitude: 33.2416 };

describe("search origin never defaults to Kampala when GPS is known", () => {
  it("uses GPS when the model fills in Kampala on its own", () => {
    const o = chooseSearchOrigin({ area: "Kampala", userText: "My nose is bleeding", gps: BUGEMBE });
    expect(o.kind).toBe("gps");
    if (o.kind !== "none") expect(o.lat).toBeCloseTo(0.4686);
  });

  it("uses GPS when the model passes a placeholder area", () => {
    expect(chooseSearchOrigin({ area: "shared GPS location", userText: "help", gps: BUGEMBE }).kind).toBe("gps");
    expect(chooseSearchOrigin({ area: null, userText: "help", gps: BUGEMBE }).kind).toBe("gps");
  });

  it("a town the user actually named still beats GPS", () => {
    const o = chooseSearchOrigin({ area: "Jinja", userText: "police near Jinja please", gps: { latitude: 0.3476, longitude: 32.5825 } });
    expect(o.kind).toBe("named");
    if (o.kind === "named") expect(o.label).toContain("Jinja");
  });

  it("without GPS a named area is used, and nothing is invented without either", () => {
    expect(chooseSearchOrigin({ area: "Kampala", userText: "nearest hospital", gps: null }).kind).toBe("named");
    expect(chooseSearchOrigin({ area: "", userText: "nearest hospital", gps: null }).kind).toBe("none");
  });

  it("ignores GPS outside Uganda", () => {
    expect(chooseSearchOrigin({ area: null, userText: "x", gps: { latitude: 0, longitude: 0 } }).kind).toBe("none");
  });

  it("matches place mentions by whole words", () => {
    expect(mentionsUgandaPlace("I'm in Jinja town", { name: "Jinja" })).toBe(true);
    expect(mentionsUgandaPlace("my nose is bleeding", { name: "Kampala" })).toBe(false);
  });
});

describe("filler narration is removed from replies", () => {
  it("drops 'Let me arrange the local help details' and the dangling 'Now,'", () => {
    const out = stripFillerSentences("Let me arrange the local help details. Now, were there any other injuries?");
    expect(out).toBe("Were there any other injuries?");
  });

  it("keeps real content untouched", () => {
    const text = "1. Sit up and lean forward.\n2. Pinch the soft part of your nose.\n\nLet me know if it stops.";
    expect(stripFillerSentences(text)).toBe(text);
    expect(stripFillerSentences("Let me check: are you safe?")).toBe("Let me check: are you safe?");
  });

  it("removes filler mid-paragraph", () => {
    expect(stripFillerSentences("Stay calm. Let me find the nearest hospitals for you. Keep pressure on it.")).toBe("Stay calm. Keep pressure on it.");
  });

  it("the playbook tells the model to name only real results and skip filler", () => {
    expect(ALLMA_EMERGENCY_PLAYBOOK).toMatch(/never assume Kampala/);
    expect(ALLMA_EMERGENCY_PLAYBOOK).toMatch(/ONLY a name from that find_facilities result/);
    expect(ALLMA_EMERGENCY_PLAYBOOK).toMatch(/Let me arrange the local help details/);
  });
});

describe("retired Location Intelligence card does not leak into chat", () => {
  it("the prompt no longer asks the model for that card or tool", () => {
    expect(ALLMA_SYSTEM_PROMPT).not.toMatch(/location_intelligence/);
    expect(ALLMA_LOCATION_BLOCK).not.toMatch(/Display: "This incident falls under/);
    expect(ALLMA_LOCATION_BLOCK).toMatch(/find_facilities/);
    expect(ALLMA_LOCATION_BLOCK).toMatch(/do not describe, invent or ask for a Location Intelligence card/);
  });

  it("strips leftover Location Intelligence headings and 'falls under' lines", () => {
    const raw = "Stay in a locked room.\n\nLOCATION INTELLIGENCE · YOUR SHARED GPS LOCATION\nThis incident falls under Bugembe Police Post.\nResponsible Station\nCall 999 if you can.";
    const out = stripFillerSentences(raw);
    expect(out).not.toMatch(/Location Intelligence/i);
    expect(out).not.toMatch(/falls under/i);
    expect(out).not.toMatch(/Responsible Station/);
    expect(out).toMatch(/Stay in a locked room/);
    expect(out).toMatch(/Call 999 if you can/);
  });

  it("strips a mid-paragraph 'falls under' sentence", () => {
    expect(stripFillerSentences("Stay quiet. This incident falls under Bugembe Police Post. Call 999.")).toBe("Stay quiet. Call 999.");
  });

  it("turns a leftover location_intelligence result into normal facility cards", () => {
    const cards = facilitiesFromLocationIntel({
      ok: true,
      area: "your shared GPS location",
      police_station: { name: "Bugembe Police Post", facility_type: "police", phone: "+256414120844", address: "Bugembe", is_24_7: true, distance_km: 0.8 },
      hospital: { name: "Jinja Regional Referral Hospital", facility_type: "hospital", phone: null, address: "Jinja", distance_km: 4.2 },
      fire_station: null,
    });
    expect(cards.map((c) => c.name)).toEqual(["Bugembe Police Post", "Jinja Regional Referral Hospital"]);
    expect(cards[0].type_label).toBe("Police");
    expect(cards[0].open_now).toBe(true);
    expect(cards[1].phone).toBeNull();
    expect(facilitiesFromLocationIntel({ ok: true })).toEqual([]);
  });
});
