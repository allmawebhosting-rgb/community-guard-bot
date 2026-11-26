import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infobip.server", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/infobip.server")>();
  return {
    ...actual,
    getInfobipConfig: () => ({ baseUrl: "https://api.infobip.test", apiKey: "k", sender: "Allma" }),
  };
});

import { callFacility, interpretCallStatus } from "./facility-call.server";

describe("interpretCallStatus", () => {
  it("maps provider statuses", () => {
    expect(interpretCallStatus({ groupName: "DELIVERED" })).toBe("answered");
    expect(interpretCallStatus({ groupName: "PENDING" })).toBeNull();
    expect(interpretCallStatus({ groupName: "UNDELIVERABLE", name: "UNDELIVERABLE_NOT_DELIVERED_BUSY" })).toBe("no_answer");
    expect(interpretCallStatus({ groupName: "REJECTED", name: "REJECTED_NETWORK" })).toBe("failed");
  });
});

describe("callFacility", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("never dials official emergency numbers", async () => {
    for (const number of ["999", "112", "911", "+256999", "tel:112"]) {
      const outcome = await callFacility({ to: number, text: "x" });
      expect(outcome.status).toBe("skipped");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("places the call with the existing TTS endpoint and reports an answered call", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ messageId: "m1", status: { groupName: "PENDING" } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ status: { groupName: "DELIVERED" } }] }), { status: 200 }));
    const outcome = await callFacility({ to: "256414123456", text: "Emergency message", pollEveryMs: 1, waitMs: 500 });
    expect(outcome).toMatchObject({ status: "answered", messageId: "m1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.infobip.test/tts/3/advanced");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "App k" });
    const sent = JSON.parse(String((init as RequestInit).body));
    expect(sent.messages[0].destinations[0].to).toBe("256414123456");
    expect(sent.messages[0].text).toBe("Emergency message");
  });

  it("reports no answer when the call is never picked up", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/logs")
        ? new Response(JSON.stringify({ results: [{ status: { groupName: "PENDING" } }] }), { status: 200 })
        : new Response(JSON.stringify({ messages: [{ messageId: "m2", status: { groupName: "PENDING" } }] }), { status: 200 }),
    );
    const outcome = await callFacility({ to: "256414123456", text: "x", pollEveryMs: 1, waitMs: 20 });
    expect(outcome.status).toBe("no_answer");
  });

  it("reports a provider failure without throwing", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const outcome = await callFacility({ to: "256414123456", text: "x" });
    expect(outcome.status).toBe("failed");
  });
});
