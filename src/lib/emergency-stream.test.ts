import { describe, expect, it } from "vitest";
import { createEmergencyCard, emergencyToolOutput } from "./emergency-stream";
import type { EmergencyRunView } from "./emergency-contact.server";

const view = { run_id: "11111111-1111-4111-8111-111111111111", status: "countdown" } as unknown as EmergencyRunView;

describe("createEmergencyCard", () => {
  it("opens immediately and closes with the run once the search finishes", async () => {
    let resolve!: (v: { ok: true; reused: false; view: EmergencyRunView }) => void;
    const card = createEmergencyCard(new Promise((r) => (resolve = r)));
    const opened = card.open();
    expect(opened[0]).toMatchObject({ type: "tool-input-available", toolName: "emergency_contact" });
    expect(card.open()).toEqual([]);
    expect(card.ready()).toEqual([]);
    resolve({ ok: true, reused: false, view });
    await Promise.resolve();
    await Promise.resolve();
    const closing = card.ready();
    expect(closing[0]).toMatchObject({ type: "tool-output-available", output: { run_id: view.run_id } });
    expect(card.ready()).toEqual([]);
    expect(await card.settle()).toEqual([]);
  });

  it("explains a missing location in text and marks the card failed", async () => {
    const card = createEmergencyCard(Promise.resolve({ ok: false as const, reason: "no_location" as const }));
    const chunks = await card.settle();
    expect(chunks[0]).toMatchObject({ type: "tool-input-available" });
    expect(chunks[1]).toMatchObject({ type: "tool-output-available", output: { failed: "no_location" } });
    expect(JSON.stringify(chunks)).toMatch(/tell me the town/);
  });

  it("turns a crashed search into a failed card", async () => {
    const card = createEmergencyCard(Promise.reject(new Error("boom")));
    const chunks = await card.settle();
    expect(chunks.some((c) => (c as { output?: { failed?: string } }).output?.failed === "unavailable")).toBe(true);
  });

  it("hides the card when a run was already started recently", () => {
    expect(emergencyToolOutput({ ok: true, reused: true, runId: "x" })).toEqual({ reused: true, run_id: null });
  });
});
