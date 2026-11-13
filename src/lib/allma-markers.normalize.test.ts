import { describe, expect, it } from "vitest";
import { parseAllmaMarkers } from "./allma-markers";
import { inUganda, haversineKm, MAX_NEARBY_KM } from "./nearby-guard";

describe("chat formatting", () => {
  it("splits 'Police 999 Toll-free 112' onto separate lines", () => {
    const r = parseAllmaMarkers("Call: Police 999 Toll-free 112");
    expect(r.text).toContain("- Police 999\n- Toll-free 112");
  });
  it("puts emoji capabilities one per line", () => {
    const r = parseAllmaMarkers("I can help:\n🚨 Report crimes 👤 Report missing people 🎒 Lost property");
    expect(r.text).toContain("- 🚨 Report crimes\n- 👤 Report missing people\n- 🎒 Lost property");
  });
  it("reads the ::emergency block and removes it from the text", () => {
    const r = parseAllmaMarkers("::emergency{type=crime}\nGo to a room you can lock.");
    expect(r.emergency).toEqual({ type: "crime" });
    expect(r.text).toBe("Go to a room you can lock.");
  });
  it("turns [YES / SKIP] into two buttons", () => {
    const r = parseAllmaMarkers("Want a tour? [YES / SKIP]");
    expect(r.text).toBe("Want a tour?");
    expect(r.suggestions.map((s) => s.label)).toEqual(["Yes", "Skip"]);
  });
  it("splits safe/danger into separate untruncated buttons", () => {
    const r = parseAllmaMarkers("Are you safe?\n::suggest[Yes, I'm safe / No, I'm in danger]");
    expect(r.suggestions.map((s) => s.label)).toEqual(["Yes, I'm safe", "No, I'm in danger"]);
  });
  it("fixes yourAI spacing and puts each emergency number on its own line", () => {
    const r = parseAllmaMarkers("I'm yourAI-powered helper.\nPolice 999, Ambulance 911, Toll-free 112");
    expect(r.text).toContain("your AI-powered");
    expect(r.text).toContain("- Police 999\n- Ambulance 112\n- Toll-free 112");
  });
});

describe("nearby guard", () => {
  it("rejects places outside Uganda and beyond 50 km", () => {
    expect(inUganda(0.4244, 33.2042)).toBe(true); // Jinja
    expect(inUganda(40.7, -74)).toBe(false); // New York
    expect(MAX_NEARBY_KM).toBe(50);
    expect(haversineKm(0.4244, 33.2042, 3.02, 30.91)).toBeGreaterThan(MAX_NEARBY_KM); // Jinja → Arua
  });
});
