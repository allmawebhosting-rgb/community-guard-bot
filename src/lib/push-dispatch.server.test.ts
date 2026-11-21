import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const maybeSingle = vi.fn();
const from = vi.fn();

vi.mock("@block65/webcrypto-web-push", () => ({
  buildPushPayload: vi.fn(async () => ({ method: "POST", headers: {}, body: "x" })),
}));

import { claimPushIdempotency, dispatchWebPush } from "./push-dispatch.server";

beforeEach(() => {
  upsert.mockReset();
  maybeSingle.mockReset();
  from.mockReset();
  from.mockImplementation(() => ({
    upsert,
    select: () => ({
      eq: () => ({
        maybeSingle,
      }),
    }),
    delete: () => ({
      in: vi.fn().mockResolvedValue({ error: null }),
    }),
  }));
  upsert.mockResolvedValue({ error: null });
  maybeSingle.mockResolvedValue({ data: null, error: null });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 201 }),
  );
  process.env.VAPID_PUBLIC_KEY = "public";
  process.env.VAPID_PRIVATE_KEY = "private";
});

describe("claimPushIdempotency", () => {
  it("allows the first send", async () => {
    const ok = await claimPushIdempotency({ from } as never, {
      idempotencyKey: "incoming_call:1:user",
      kind: "incoming_emergency_call",
      recipientUserId: "user",
      eventId: "1",
    });
    expect(ok).toBe(true);
  });

  it("skips a recent successful delivery", async () => {
    maybeSingle.mockResolvedValue({
      data: { stage: "provider_accepted", created_at: new Date().toISOString() },
      error: null,
    });
    const ok = await claimPushIdempotency({ from } as never, {
      idempotencyKey: "incoming_call:1:user",
      kind: "incoming_emergency_call",
      recipientUserId: "user",
      eventId: "1",
    });
    expect(ok).toBe(false);
  });
});

describe("dispatchWebPush", () => {
  it("reports no_devices without calling the provider", async () => {
    const result = await dispatchWebPush({
      admin: { from } as never,
      devices: [],
      recipientUserId: "user",
      kind: "sos_activated",
      idempotencyKey: "sos:1:user",
      payload: { type: "sos_activity", title: "SOS", body: "Help" },
    });
    expect(result.stage).toBe("no_devices");
    expect(result.delivered).toBe(0);
  });

  it("counts provider-accepted devices", async () => {
    const result = await dispatchWebPush({
      admin: { from } as never,
      devices: [
        {
          id: "d1",
          endpoint: "https://push.example/1",
          p256dh: "abc",
          auth_key: "def",
        },
      ],
      recipientUserId: "user",
      kind: "incoming_emergency_call",
      idempotencyKey: "call:1:user",
      payload: { type: "incoming_emergency_call", title: "Call", body: "Ring" },
    });
    expect(result.stage).toBe("provider_accepted");
    expect(result.delivered).toBe(1);
  });
});
