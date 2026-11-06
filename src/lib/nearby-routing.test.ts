import { afterEach, describe, expect, it, vi } from "vitest";
import { getNearbyRoute } from "@/lib/nearby-routing";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getNearbyRoute", () => {
  it("uses the walking profile and returns route distance, duration and next maneuver", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [
          {
            distance: 1800,
            duration: 900,
            geometry: {
              coordinates: [
                [32.58, 0.31],
                [32.59, 0.32],
              ],
            },
            legs: [
              {
                steps: [
                  { distance: 0, maneuver: { type: "depart" } },
                  {
                    distance: 120,
                    name: "Jinja Road",
                    maneuver: { type: "turn", modifier: "right" },
                  },
                ],
              },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const route = await getNearbyRoute(
      { lat: 0.31, lng: 32.58 },
      { lat: 0.32, lng: 32.59 },
      "walk",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/routed-foot/route/v1/driving/32.58,0.31;32.59,0.32"),
      expect.objectContaining({ signal: undefined }),
    );
    expect(route).toMatchObject({
      distance_m: 1800,
      duration_s: 900,
      nextManeuver: "In 120 m, turn right onto Jinja Road",
      coordinates: [
        { lat: 0.31, lng: 32.58 },
        { lat: 0.32, lng: 32.59 },
      ],
    });
  });

  it("reports a clear error when the routing service has no path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: "NoRoute", message: "No route found" }),
      }),
    );

    await expect(getNearbyRoute({ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, "drive")).rejects.toThrow(
      "No route found",
    );
  });
});
