import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/google-maps-loader", () => ({
  getGoogleMapsBrowserKey: () => null,
  googleMapsAuthFailed: () => false,
  loadGoogleMaps: vi.fn(),
  onGoogleMapsAuthFailure: () => () => undefined,
}));
vi.mock("@/components/allma/live-location-map", () => ({
  OsmTileMap: () => <div aria-hidden="true">Map tiles</div>,
}));

import { NearbyMap } from "./nearby-map";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows a tappable medical beacon and facility details on the OpenStreetMap fallback", () => {
  render(
    <NearbyMap
      center={{ lat: 0, lng: 0 }}
      userLocation={{ lat: 0, lng: 0 }}
      places={[
        {
          id: "hospital-1",
          name: "Central Hospital",
          type: "hospital",
          address: null,
          phone: null,
          open_now: null,
          distance_m: 340,
          latitude: 0,
          longitude: 0,
          source: "seeded",
        },
      ]}
    />,
  );

  const marker = screen.getByRole("button", {
    name: "Central Hospital, 340 m away, hospital",
  });
  expect(marker.querySelector(".animate-ping")).not.toBeNull();
  fireEvent.click(marker);
  expect(screen.getByText("340 m · hospital")).toBeTruthy();
});
