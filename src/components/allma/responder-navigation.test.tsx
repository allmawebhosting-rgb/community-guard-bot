import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { getNearbyPlacesMock } = vi.hoisted(() => ({ getNearbyPlacesMock: vi.fn() }));
vi.mock("@/lib/places.functions", () => ({ getNearbyPlaces: getNearbyPlacesMock }));
vi.mock("@/lib/nearby-fallback", () => ({ getSeededNearbyFacilities: () => [] }));
vi.mock("@/components/allma/live-location-map", () => ({ OsmTileMap: () => null }));
vi.mock("@/lib/google-maps-loader", () => ({
  getGoogleMapsBrowserKey: () => null,
  googleMapsAuthFailed: () => false,
}));
import { ResponderNavigation } from "./responder-navigation";

let gps: PositionCallback;
const requests: { url: string; signal: AbortSignal; resolve: (value: unknown) => void }[] = [];
const caller = { lat: 0.32, lng: 32.59 };
const routeResponse = {
  ok: true,
  json: async () => ({ routes: [{
    geometry: { coordinates: [[32.58, 0.31], [32.59, 0.32]] },
    distance: 1500, duration: 300,
    legs: [{ steps: [{ distance: 100, maneuver: { type: "depart" } },
      { distance: 1400, name: "Jinja Road", maneuver: { type: "turn", modifier: "right" } },
      { distance: 0, maneuver: { type: "arrive" } }] }],
  }] }),
};

function fix(lat = 0.31) {
  act(() => gps({ coords: { latitude: lat, longitude: 32.58 } } as GeolocationPosition));
}

beforeEach(() => {
  requests.length = 0;
  getNearbyPlacesMock.mockReset();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("navigator", { geolocation: {
    watchPosition: vi.fn((callback: PositionCallback) => { gps = callback; return 1; }),
    clearWatch: vi.fn(),
  } });
  vi.stubGlobal("fetch", vi.fn((url: string, options: { signal: AbortSignal }) =>
    new Promise((resolve) => requests.push({ url, signal: options.signal, resolve }))));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("finishes a delayed route despite call timer renders and small GPS updates", async () => {
  const view = render(<ResponderNavigation caller={{ ...caller }} />);
  fix();
  for (let tick = 0; tick < 3; tick += 1) {
    view.rerender(<ResponderNavigation caller={{ ...caller }} />);
    fix(0.31001 + tick * 0.00001);
  }
  expect(requests).toHaveLength(1);
  expect(requests[0].signal.aborted).toBe(false);
  await act(async () => requests[0].resolve(routeResponse));
  expect(screen.queryByText("Updating route")).toBeNull();
  expect(screen.getByText("5 min")).toBeTruthy();
});

it("supersedes routes only for meaningful movement, mode changes or manual refresh", async () => {
  const view = render(<ResponderNavigation caller={caller} />);
  fix();
  fix(0.311);
  expect(requests).toHaveLength(2);
  expect(requests[0].signal.aborted).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Walk" }));
  expect(requests).toHaveLength(3);
  expect(requests[1].signal.aborted).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Recalculate route" }));
  expect(requests).toHaveLength(4);
  expect(requests[2].signal.aborted).toBe(true);
  await act(async () => requests[0].resolve(routeResponse));
  expect(screen.queryByText("5 min")).toBeNull();
  view.unmount();
  expect(requests[3].signal.aborted).toBe(true);
});

it("starts at the nearest hospital and reroutes when another help type is selected", async () => {
  const places = [
    {
      id: "hospital-far",
      name: "Far Hospital",
      type: "hospital",
      address: null,
      phone: null,
      distance_m: 1800,
      latitude: 0.33,
      longitude: 32.59,
    },
    {
      id: "hospital-near",
      name: "Nearest Hospital",
      type: "hospital",
      address: null,
      phone: null,
      distance_m: 220,
      latitude: 0.311,
      longitude: 32.581,
    },
    {
      id: "clinic",
      name: "Nearby Clinic",
      type: "clinic",
      address: null,
      phone: null,
      distance_m: 350,
      latitude: 0.312,
      longitude: 32.582,
    },
  ];
  render(
    <ResponderNavigation
      caller={caller}
      initialLocation={{ lat: 0.31, lng: 32.58 }}
      trackLocation={false}
      helpPlaces={places}
    />,
  );

  expect(requests).toHaveLength(1);
  expect(requests[0].url).toContain("32.581,0.311");
  await act(async () => requests[0].resolve(routeResponse));
  fireEvent.click(screen.getByRole("button", { name: /Show turn-by-turn steps/ }));
  expect(screen.getByText("Arrive at Nearest Hospital")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /Nearest Clinic/ }));
  expect(requests).toHaveLength(2);
  expect(requests[1].url).toContain("32.582,0.312");
});

it("keeps missing categories active and searches them out to 15 km", async () => {
  getNearbyPlacesMock.mockResolvedValue([
    {
      id: "clinic-wide-search",
      name: "Bugembe Health Centre IV",
      type: "hospital",
      address: "Bugembe, Jinja",
      phone: null,
      distance_m: 2600,
      latitude: 0.33,
      longitude: 32.59,
      source: "google",
      open_now: null,
    },
  ]);

  render(
    <ResponderNavigation
      caller={caller}
      initialLocation={caller}
      searchCenter={caller}
      trackLocation={false}
      helpPlaces={[]}
    />,
  );

  const pharmacyButton = screen.getByRole("button", { name: /Nearest Pharmacy/ });
  expect(pharmacyButton.hasAttribute("disabled")).toBe(false);
  expect(pharmacyButton.className).toContain("justify-self-center");

  fireEvent.click(screen.getByRole("button", { name: /Nearest Clinic/ }));
  await act(async () => {
    await Promise.resolve();
  });

  expect(getNearbyPlacesMock).toHaveBeenCalledWith({
    data: {
      latitude: caller.lat,
      longitude: caller.lng,
      radiusMeters: 15_000,
      limit: 20,
      types: ["medical_clinic", "doctor"],
    },
  });
  expect(screen.getByText(/Routing to Bugembe Health Centre IV/)).toBeTruthy();
});