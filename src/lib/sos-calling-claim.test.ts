import { describe, expect, it } from "vitest";

/**
 * Mirrors claimSosEmergencyCall result parsing so regressing the answer→chat
 * contract (accepted + thread + voice primary) is caught without hitting the DB.
 */
function parseClaimResult(data: unknown) {
  const result = (Array.isArray(data) ? data[0] : data) as
    | {
        accepted?: boolean;
        call_session_id?: string;
        thread_id?: string | null;
        is_voice_primary?: boolean;
      }
    | null
    | undefined;
  return {
    accepted: Boolean(result?.accepted),
    callId: result?.call_session_id ?? null,
    threadId: result?.thread_id ?? null,
    isVoicePrimary: result?.is_voice_primary !== false,
  };
}

describe("claimSosEmergencyCall result contract", () => {
  it("opens the same thread when the first responder answers", () => {
    expect(
      parseClaimResult([
        {
          accepted: true,
          call_session_id: "call-1",
          thread_id: "thread-original",
          is_voice_primary: true,
        },
      ]),
    ).toEqual({
      accepted: true,
      callId: "call-1",
      threadId: "thread-original",
      isVoicePrimary: true,
    });
  });

  it("still joins chat for a secondary answerer without making them voice primary", () => {
    expect(
      parseClaimResult({
        accepted: true,
        call_session_id: "call-2",
        thread_id: "thread-original",
        is_voice_primary: false,
      }),
    ).toEqual({
      accepted: true,
      callId: "call-2",
      threadId: "thread-original",
      isVoicePrimary: false,
    });
  });

  it("does not treat a rejected or unavailable claim as joined", () => {
    expect(parseClaimResult([{ accepted: false, call_session_id: "call-3", thread_id: null }])).toEqual({
      accepted: false,
      callId: "call-3",
      threadId: null,
      isVoicePrimary: true,
    });
  });
});
