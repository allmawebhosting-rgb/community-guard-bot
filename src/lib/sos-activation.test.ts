import { afterEach, describe, expect, it, vi } from "vitest";
import { activateCanonicalSos, getOptionalPosition } from "./sos-activation";

const notifyMock = vi.fn();

vi.mock("@/lib/push.functions", () => ({
  notifySosActivity: (...args: unknown[]) => notifyMock(...args),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  notifyMock.mockReset();
});

describe("getOptionalPosition", () => {
  it("resolves null when geolocation is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    await expect(getOptionalPosition(50)).resolves.toBeNull();
  });

  it("times out without rejecting", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: () => {
          /* never answers */
        },
      },
    });
    await expect(getOptionalPosition(30)).resolves.toBeNull();
  });
});

describe("activateCanonicalSos", () => {
  it("reuses an already-active SOS for the same thread", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ sos_active: true, sos_activity_id: "sos-existing" }],
      error: null,
    });
    const from = vi.fn();
    const result = await activateCanonicalSos({
      supabase: { rpc, from } as never,
      userId: "user-1",
      threadId: "thread-1",
      emergencyType: "medical",
    });
    expect(result.activityId).toBe("sos-existing");
    expect(result.reused).toBe(true);
    expect(from).toHaveBeenCalledWith("sos_activation_events");
  });

  it("creates a case without waiting on GPS and notifies the network", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (
          success: (position: GeolocationPosition) => void,
        ) => {
          window.setTimeout(() => {
            success({
              coords: {
                latitude: 1,
                longitude: 2,
                accuracy: 12,
              },
            } as GeolocationPosition);
          }, 5);
        },
      },
    });
    notifyMock.mockResolvedValue({ delivered: 2, recipients: 3, devices: 2 });
    const insert = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: "sos-new" }, error: null }),
      }),
    });
    const update = vi.fn().mockReturnValue({
      eq: () => ({
        eq: () => ({
          then: (resolve: (value: { error: null }) => void) =>
            Promise.resolve({ error: null }).then(resolve),
        }),
      }),
    });
    const from = vi.fn((table: string) => {
      if (table === "safety_activity") return { insert, update };
      return {
        insert: () => Promise.resolve({ error: null }),
      };
    });
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    const stages: string[] = [];
    const result = await activateCanonicalSos({
      supabase: { rpc, from } as never,
      userId: "user-1",
      threadId: "thread-1",
      emergencyType: "medical",
      onStage: (stage) => stages.push(stage),
    });

    expect(result.activityId).toBe("sos-new");
    expect(result.reused).toBe(false);
    expect(result.notified).toBe(true);
    expect(result.notifyDelivered).toBe(2);
    expect(stages).toContain("creating");
    expect(stages).toContain("notifying");
    expect(stages).toContain("activated");
    expect(notifyMock).toHaveBeenCalledWith({ data: { activityId: "sos-new" } });
  });

  it("still activates when network notify fails", async () => {
    notifyMock.mockRejectedValue(new Error("push down"));
    const insert = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: "sos-2" }, error: null }),
      }),
    });
    const from = vi.fn((table: string) => {
      if (table === "safety_activity") {
        return {
          insert,
          update: () => ({
            eq: () => ({
              eq: () => ({
                then: (resolve: (value: { error: null }) => void) =>
                  Promise.resolve({ error: null }).then(resolve),
              }),
            }),
          }),
        };
      }
      return { insert: () => Promise.resolve({ error: null }) };
    });
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.stubGlobal("navigator", {});

    const result = await activateCanonicalSos({
      supabase: { rpc, from } as never,
      userId: "user-1",
      threadId: "thread-1",
      emergencyType: "crime",
    });
    expect(result.activityId).toBe("sos-2");
    expect(result.notified).toBe(false);
  });
});
