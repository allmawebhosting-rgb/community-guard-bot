import { describe, expect, it } from "vitest";
import { emergencyOrderSteps, networkStage } from "./sos-stage";

const base = {
  answered: null,
  welfareConfirmed: false,
  gsmEscalated: false,
  telecom: { status: "idle" as const, contactsAlerted: 0, message: null },
};

describe("networkStage", () => {
  it("holds nearby help while the Safety Network is being rung online", () => {
    expect(networkStage(base)).toMatchObject({ stage: "online", release: false });
    expect(networkStage(null)).toMatchObject({ stage: "online", release: false });
  });

  it("holds nearby help while local phone calls are being placed", () => {
    const info = networkStage({ ...base, gsmEscalated: true, telecom: { ...base.telecom, status: "triggering" } });
    expect(info).toMatchObject({ stage: "local_calls", release: false });
  });

  it("releases nearby help once local calls are finished", () => {
    const info = networkStage({ ...base, gsmEscalated: true, telecom: { ...base.telecom, status: "completed" } });
    expect(info).toMatchObject({ stage: "done", release: true, outcome: "local_calls_finished" });
  });

  it("releases nearby help when local calls are unavailable, so help is never blocked", () => {
    const info = networkStage({ ...base, gsmEscalated: true, telecom: { ...base.telecom, status: "not_configured" } });
    expect(info).toMatchObject({ release: true, outcome: "local_calls_unavailable" });
  });

  it("releases nearby help when a network member answers", () => {
    const info = networkStage({ ...base, answered: { call_id: "c1" } as never });
    expect(info).toMatchObject({ release: true, outcome: "answered" });
  });
});

describe("emergencyOrderSteps", () => {
  it("shows the three steps in order with nearby help last", () => {
    const steps = emergencyOrderSteps({ info: networkStage(base), nearbyStarted: false, nearbyFinished: false });
    expect(steps.map((s) => s.key)).toEqual(["online", "local", "nearby"]);
    expect(steps.map((s) => s.state)).toEqual(["active", "waiting", "waiting"]);
  });

  it("moves to local calls, then nearby help", () => {
    const local = emergencyOrderSteps({
      info: networkStage({ ...base, gsmEscalated: true, telecom: { ...base.telecom, status: "queued" } }),
      nearbyStarted: false,
      nearbyFinished: false,
    });
    expect(local.map((s) => s.state)).toEqual(["done", "active", "waiting"]);
    const nearby = emergencyOrderSteps({
      info: networkStage({ ...base, gsmEscalated: true, telecom: { ...base.telecom, status: "completed" } }),
      nearbyStarted: true,
      nearbyFinished: false,
    });
    expect(nearby.map((s) => s.state)).toEqual(["done", "done", "active"]);
  });

  it("skips local calls when someone answered online", () => {
    const steps = emergencyOrderSteps({
      info: networkStage({ ...base, answered: { call_id: "c1" } as never }),
      nearbyStarted: true,
      nearbyFinished: false,
    });
    expect(steps[1].state).toBe("skipped");
  });
});
