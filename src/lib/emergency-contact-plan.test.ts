import { describe, expect, it } from "vitest";
import {
  classifyRealEmergency,
  emergencyCallScript,
  emergencyEmailBody,
  emergencySubject,
  extractPublishedEmails,
  normalizeFacilityPhone,
  pickEmergencyFacilities,
  type EmergencyContext,
  type FacilityCandidate,
} from "./emergency-contact-plan";

describe("classifyRealEmergency", () => {
  it.each([
    "I was in a boda boda accident, I'm in Jinja",
    "my friend is unconscious and not waking up",
    "I'm bleeding heavily from my leg",
    "there is a fire in my house, I'm trapped",
    "I was assaulted just now near the market",
  ])("treats %s as a real emergency", (text) => {
    expect(classifyRealEmergency(text)).not.toBeNull();
  });

  it.each([
    "ask about an appointment",
    "what should I do if someone is unconscious",
    "how do I treat heavy bleeding?",
    "I smoke a lot",
    "I have a small cut that is bleeding a little",
    "tips for fire safety at home",
    "write an email to Jinja Hospital",
    "I feel unsafe walking home alone",
  ])("does not auto-contact for %s", (text) => {
    expect(classifyRealEmergency(text)).toBeNull();
  });
});

describe("normalizeFacilityPhone", () => {
  it("normalizes Uganda numbers", () => {
    expect(normalizeFacilityPhone("0772 123 456")).toBe("256772123456");
    expect(normalizeFacilityPhone("+256 414 123456")).toBe("256414123456");
  });
  it("never accepts official emergency numbers or junk", () => {
    for (const bad of ["999", "112", "911", "+256999", "tel:112", "", null, undefined, "12345", "+1 202 555 0100"]) {
      expect(normalizeFacilityPhone(bad as string)).toBeNull();
    }
  });
});

describe("extractPublishedEmails", () => {
  it("returns only addresses published in the page, official domain first", () => {
    const html = `<a href="mailto:info@jinjahospital.go.ug">Mail</a> <img src="logo@2x.png">
      <p>noreply@jinjahospital.go.ug</p> <p>someone@gmail.com</p> user@example.com`;
    const found = extractPublishedEmails(html, "https://www.jinjahospital.go.ug/");
    expect(found[0]).toBe("info@jinjahospital.go.ug");
    expect(found).toContain("someone@gmail.com");
    expect(found.join(" ")).not.toMatch(/noreply|example\.com|\.png/);
  });
  it("finds nothing rather than guessing when the page has no email", () => {
    expect(extractPublishedEmails("<p>Call us on 0414 000 000</p>", "https://clinic.ug")).toEqual([]);
  });
});

const candidate = (over: Partial<FacilityCandidate>): FacilityCandidate => ({
  id: "x",
  name: "Test Hospital",
  type: "hospital",
  address: null,
  phone: "0772123456",
  website: null,
  email: null,
  distance_m: 1000,
  open_now: null,
  is_24h: false,
  latitude: 0.4,
  longitude: 33.2,
  source: "google",
  ...over,
});

describe("pickEmergencyFacilities", () => {
  it("takes the 3 nearest reachable health facilities and skips unreachable or closed ones", () => {
    const picked = pickEmergencyFacilities([
      candidate({ id: "1", name: "Far Hospital", distance_m: 9000 }),
      candidate({ id: "2", name: "No Contact Clinic", distance_m: 100, phone: null, email: null }),
      candidate({ id: "3", name: "Closed Clinic", distance_m: 200, open_now: false }),
      candidate({ id: "4", name: "Night Hospital", distance_m: 300, open_now: false, is_24h: true }),
      candidate({ id: "5", name: "Email Only Health Centre", distance_m: 400, phone: null, email: "hc@clinic.ug" }),
      candidate({ id: "6", name: "Pharmacy Plus", type: "pharmacy", distance_m: 50 }),
      candidate({ id: "7", name: "Bad Number Hospital", distance_m: 60, phone: "999" }),
      candidate({ id: "8", name: "Second Hospital", distance_m: 500 }),
    ]);
    expect(picked.map((f) => f.name)).toEqual(["Night Hospital", "Email Only Health Centre", "Second Hospital"]);
    expect(picked[1]?.phone).toBeNull();
  });
});

const ctx: EmergencyContext = {
  name: "Allan Mawerere",
  phone: "+256700111222",
  incident: "Road / boda boda accident",
  situation: "I was in a boda boda accident, I'm in Jinja",
  place: "Jinja",
  address: "Main Street, Jinja, Uganda",
  mapsLink: "https://www.google.com/maps?q=0.424700,33.204200",
};

describe("emergency messages", () => {
  it("builds the subject from real data", () => {
    expect(emergencySubject(ctx)).toBe("EMERGENCY: Road / boda boda accident near Jinja – Allan Mawerere");
    expect(emergencySubject({ ...ctx, name: null, place: null })).toBe("EMERGENCY: Road / boda boda accident");
  });

  it("fills the body with real facts and never leaves a placeholder", () => {
    const body = emergencyEmailBody(ctx, { facilityName: "Jinja Hospital", now: new Date("2026-11-26T09:30:00Z") });
    expect(body).toContain("Allan Mawerere");
    expect(body).toContain("+256700111222");
    expect(body).toContain("https://www.google.com/maps?q=0.424700,33.204200");
    expect(body).toContain("26/11/2026 12:30");
    expect(body).not.toMatch(/\[[^\]]*\]/);
  });

  it("omits unknown fields instead of inventing them", () => {
    const body = emergencyEmailBody(
      { ...ctx, name: null, phone: null, situation: null, address: null, place: null },
      { facilityName: "Clinic", now: new Date("2026-11-26T09:30:00Z") },
    );
    expect(body).not.toMatch(/Name:|Call back on:|What happened:|Location:/);
    expect(body).not.toMatch(/\[[^\]]*\]|undefined|null/);
  });

  it("speaks who, what, where and a callback number, without a URL", () => {
    const script = emergencyCallScript(ctx, { mapsInEmail: true });
    expect(script).toContain("Allan Mawerere");
    expect(script).toContain("Road / boda boda accident");
    expect(script).toContain("Main Street, Jinja");
    expect(script).toContain("2 5 6 7 0 0 1 1 1 2 2 2");
    expect(script).toContain("map link has been sent to your email");
    expect(script).not.toMatch(/https?:|www\./);
    expect(script).not.toMatch(/\b(999|112|911)\b/);
  });
});
