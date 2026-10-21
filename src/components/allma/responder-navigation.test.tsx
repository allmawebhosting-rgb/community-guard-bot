import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/components/allma/live-location-map", () => ({ OsmTileMap: () => null }));
vi.mock("@/lib/google-maps-loader", () => ({
  getGoogleMapsBrowserKey: () => null,
  googleMapsAuthFailed: () => false,
}));
import { ResponderNavigation } from "./responder-navigation";

let gps: PositionCallback;
const requests: { signal: AbortSignal; resolve: (value: unknown) => void }[] = [];
const caller = { lat: 0.32, lng: 32.59 };
const routeResponse = {
  ok: true,
  json: async () => ({ routes: [{
    geometry: { coordinates: [[32.58, 0.31], [32.59, 0.32]] },
    distance: 1500, duration: 300,
    legs: [{ steps: [{ distance: 100, maneuver: { type: "depart" } },
      { distance: 1400, name: "Jinja Road", maneuver: { type: "turn", modifier: "right" } }] }],
  }] }),
};

function fix(lat = 0.31) {
  act(() => gps({ coords: { latitude: lat, longitude: 32.58 } } as GeolocationPosition));
}

beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("navigator", { geolocation: {
    watchPosition: vi.fn((callback: PositionCallback) => { gps = callback; return 1; }),
    clearWatch: vi.fn(),
  } });
  vi.stubGlobal("fetch", vi.fn((_url: string, options: { signal: AbortSignal }) =>
    new Promise((resolve) => requests.push({ signal: options.signal, resolve }))));
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