import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setCallStatus: vi.fn(() => Promise.resolve()),
  requestVoiceCall: vi.fn(),
}));

vi.mock("@/lib/zego-call", () => ({
  requestVoiceCall: mocks.requestVoiceCall,
  setCallStatus: mocks.setCallStatus,
}));

vi.mock("@/lib/sos-calling", () => ({
  answeredAttempt: vi.fn(() => undefined),
  finishSosCallRound: vi.fn(),
  isSosWelfareConfirmed: vi.fn(),
  isTerminal: (status: string) => ["declined", "missed", "failed", "ended"].includes(status),
  listSosCallAttempts: vi.fn(),
  listSosCallTargets: vi.fn(),
}));

vi.mock("@/lib/sos-calling-settings", () => ({
  loadSosCallingSettings: vi.fn(),
}));

import { getSosEscalation, type SosCallAttempt } from "@/lib/sos-escalation-controller";

function attempt(callId: string, status: string): SosCallAttempt {
  return {
    call_id: callId,
    recipient_id: `recipient-${callId}`,
    full_name: "Safety contact",
    avatar_url: null,
    safety_role: "Friend",
    status,
    created_at: "2026-11-08T00:00:00.000Z",
    accepted_at: null,
    connected_at: null,
    ended_at: null,
    duration: null,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("SOS escalation stop", () => {
  it("cancels pending calls but leaves accepted and connected calls active", async () => {
    const controller = getSosEscalation("sos-stop-regression", "emergency");
    controller.state.attempts = [
      attempt("queued-call", "queued"),
      attempt("initiating-call", "initiating"),
      attempt("calling-call", "calling"),
      attempt("ringing-call", "ringing"),
      attempt("accepted-call", "accepted"),
      attempt("accepted-call", "connecting"),
      attempt("connected-call", "connected"),
    ];

    controller.stop();
    await vi.waitFor(() => expect(mocks.setCallStatus).toHaveBeenCalledTimes(4));

    expect(mocks.setCallStatus.mock.calls).toEqual([
      ["queued-call", "ended"],
      ["initiating-call", "ended"],
      ["calling-call", "ended"],
      ["ringing-call", "ended"],
    ]);
  });
});
