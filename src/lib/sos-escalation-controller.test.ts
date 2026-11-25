import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setCallStatus: vi.fn(() => Promise.resolve()),
  requestVoiceCall: vi.fn(),
  triggerOfflineTelecomEscalation: vi.fn(async () => ({
    ok: true,
    status: "completed",
    provider: "africas_talking",
    contactsTargeted: 2,
    callsQueued: 2,
    smsQueued: 2,
    message: "Alerted 2 emergency contacts via direct mobile call & SMS.",
  })),
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

vi.mock("@/lib/telecom.functions", () => ({
  triggerOfflineTelecomEscalation: mocks.triggerOfflineTelecomEscalation,
}));

import { getSosEscalation, type SosCallAttempt } from "@/lib/sos-escalation-controller";
import { listSosCallAttempts, listSosCallTargets, isSosWelfareConfirmed } from "@/lib/sos-calling";

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

describe("SOS offline telecom fallback", () => {
  it("triggers GSM/SMS once when there are no in-app callable targets", async () => {
    vi.mocked(listSosCallTargets).mockResolvedValue([]);
    vi.mocked(listSosCallAttempts).mockResolvedValue([]);
    vi.mocked(isSosWelfareConfirmed).mockResolvedValue(false);

    const controller = getSosEscalation("sos-telecom-empty", "assault");
    await controller.init(true);

    await vi.waitFor(() => expect(mocks.triggerOfflineTelecomEscalation).toHaveBeenCalledTimes(1));
    expect(mocks.triggerOfflineTelecomEscalation).toHaveBeenCalledWith({
      data: { activityId: "sos-telecom-empty" },
    });
    await vi.waitFor(() => expect(controller.state.telecom.status).toBe("completed"));
    expect(controller.state.telecom.contactsAlerted).toBe(2);
    expect(controller.state.telecom.message).toMatch(/Alerted 2 emergency contacts/i);
  });
});
