import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const {
  endEscalationMock,
  createThreadMock,
  fromMock,
  invalidateQueriesMock,
  getNearbyPlacesMock,
  inlineCallMock,
  notifyMock,
  navigateMock,
  insertMock,
  rpcMock,
  runCallActionMock,
  singleMock,
  setQueryDataMock,
  updateMock,
} = vi.hoisted(() => ({
  endEscalationMock: vi.fn(),
  createThreadMock: vi.fn(),
  fromMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
  getNearbyPlacesMock: vi.fn(),
  inlineCallMock: vi.fn(),
  insertMock: vi.fn(),
  notifyMock: vi.fn(),
  navigateMock: vi.fn(),
  rpcMock: vi.fn(),
  runCallActionMock: vi.fn(),
  singleMock: vi.fn(),
  setQueryDataMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
    setQueryData: setQueryDataMock,
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromMock, rpc: rpcMock },
}));
vi.mock("@/components/allma/live-location-map", () => ({
  LiveLocationMap: ({ heightClassName }: { heightClassName: string }) => (
    <div data-testid="live-map" data-height={heightClassName} />
  ),
}));
vi.mock("@/components/allma/sos/emergency-call-escalation", () => ({
  EmergencyCallEscalation: () => <div>Safety network dialing</div>,
}));
vi.mock("@/lib/places.functions", () => ({ getNearbyPlaces: getNearbyPlacesMock }));
vi.mock("@/lib/sos-escalation-controller", () => ({
  endSosEscalation: endEscalationMock,
}));
vi.mock("@/lib/push.functions", () => ({ notifySosActivity: notifyMock }));
vi.mock("@/lib/zego-call", () => ({ primeMicrophone: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/sos-inline-call", () => ({
  runSosInlineCallAction: runCallActionMock,
  useSosInlineCall: inlineCallMock,
}));
vi.mock("@/lib/threads", () => ({ createThread: createThreadMock }));
vi.mock("@/lib/active-chat-thread", () => ({
  peekActiveChatThread: () => null,
}));

import { InChatSos } from "./in-chat-sos";

const location = {
  coords: {
    latitude: 0.31,
    longitude: 32.58,
    accuracy: 8,
  },
} as GeolocationPosition;

beforeEach(() => {
  vi.useFakeTimers();
  fromMock.mockClear();
  createThreadMock.mockReset();
  createThreadMock.mockResolvedValue({
    id: "emergency-thread-1",
    title: "Emergency SOS",
    updated_at: "2026-11-17T00:00:00.000Z",
  });
  invalidateQueriesMock.mockReset();
  navigateMock.mockReset();
  setQueryDataMock.mockReset();
  insertMock.mockClear();
  updateMock.mockClear();
  runCallActionMock.mockClear();
  rpcMock.mockResolvedValue({ data: [], error: null });
  singleMock.mockResolvedValue({ data: { id: "sos-1" }, error: null });
  updateMock.mockImplementation((payload: Record<string, unknown>) => {
    const error = "sos_status" in payload
      ? { code: "PGRST204", message: "column safety_activity.sos_status does not exist" }
      : null;
    const updateChain: {
      eq: ReturnType<typeof vi.fn>;
      then: Promise<{ error: typeof error }>["then"];
    } = {
      eq: vi.fn(() => updateChain),
      then: (resolve, reject) => Promise.resolve({ error }).then(resolve, reject),
    };
    return updateChain;
  });
  fromMock.mockImplementation(() => ({
    insert: insertMock.mockImplementation(() => ({
      select: vi.fn(() => ({ single: singleMock })),
    })),
    update: updateMock,
  }));
  getNearbyPlacesMock.mockResolvedValue([
    {
      id: "hospital-1",
      name: "City Hospital",
      type: "hospital",
      address: null,
      phone: null,
      distance_m: 450,
      latitude: 0.312,
      longitude: 32.581,
    },
    {
      id: "police-1",
      name: "Central Police",
      type: "police",
      address: null,
      phone: null,
      distance_m: 1200,
      latitude: 0.313,
      longitude: 32.582,
    },
  ]);
  inlineCallMock.mockReturnValue({
    activityId: "sos-1",
    callId: "call-1",
    name: "Amina N.",
    avatarUrl: null,
    safetyRole: "Sister",
    status: "connected",
    seconds: 125,
    muted: false,
    speaker: true,
  });
  runCallActionMock.mockReset();
  endEscalationMock.mockResolvedValue(undefined);
  notifyMock.mockResolvedValue({ delivered: 1, devices: 1, recipients: 1 });
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: vi.fn((success: PositionCallback) => success(location)),
      watchPosition: vi.fn((success: PositionCallback) => {
        success(location);
        return 1;
      }),
      clearWatch: vi.fn(),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("shows the live map and emergency call controls in the SOS card", async () => {
  const onActivityStarted = vi.fn();
  const onActivityEnded = vi.fn();
  render(
    <InChatSos
      type="crime"
      lines={[{ number: "999" }, { number: "112" }]}
      threadId="thread-1"
      onActivityStarted={onActivityStarted}
      onActivityEnded={onActivityEnded}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Activate SOS" }));

  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  vi.useRealTimers();

  expect(await screen.findByText("SOS activated")).toBeTruthy();
  expect(screen.getByTestId("live-map").getAttribute("data-height")).toBe("h-44");
  expect(await screen.findByText("Nearby help")).toBeTruthy();
  expect(screen.getByText("Choose a category to show places.")).toBeTruthy();
  expect(screen.queryByText("City Hospital")).toBeNull();
  expect(screen.getByRole("button", { name: /Hospitals/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Police/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Hospitals/ }));
  expect(screen.getByText("City Hospital")).toBeTruthy();
  expect(screen.getByText(/450m/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Police/ }));
  expect(screen.getByText("Central Police")).toBeTruthy();
  expect(screen.getByText(/1\.2km/)).toBeTruthy();
  expect(getNearbyPlacesMock).toHaveBeenCalledWith({
    data: expect.objectContaining({
      limit: 12,
      types: expect.arrayContaining(["hospital", "police", "fire_station"]),
    }),
  });
  expect(screen.getByText("Amina N.")).toBeTruthy();
  expect(screen.getByText(/Connected · Sister/)).toBeTruthy();
  expect(screen.queryByText("Call controls are pinned above the chat.")).toBeNull();
  expect(screen.queryByText(/Escalating emergency call/)).toBeNull();
  expect(screen.getByRole("button", { name: "Mute call" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Use earpiece" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "End emergency call" })).toBeTruthy();
  expect(screen.getByText("02:05")).toBeTruthy();
  expect(onActivityStarted).toHaveBeenCalledWith("sos-1", expect.anything());
  expect(screen.getByRole("link", { name: "Call 999 Police" }).getAttribute("href")).toBe("tel:999");
  expect(screen.getByRole("link", { name: "Call 112 Toll-free" }).getAttribute("href")).toBe("tel:112");

  fireEvent.click(screen.getByRole("button", { name: "Mute call" }));
  expect(runCallActionMock).toHaveBeenCalledWith("toggleMute");

  fireEvent.click(screen.getByRole("button", { name: "Hide map" }));
  expect(screen.queryByTestId("live-map")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "I'm safe · End SOS" }));
  expect(await screen.findByText(/Safety network notified/)).toBeTruthy();
  expect(onActivityEnded).toHaveBeenCalledWith("sos-1");
  expect(endEscalationMock).toHaveBeenCalledWith("sos-1");
  expect(runCallActionMock).toHaveBeenCalledWith("hangUp");
  expect(updateMock.mock.calls.at(-1)?.[0]).toMatchObject({
    details: { sos_status: "cancelled" },
  });
  expect(insertMock).toHaveBeenCalledWith(
    expect.objectContaining({
      details: expect.objectContaining({ thread_id: "thread-1" }),
    }),
  );
  expect(notifyMock).toHaveBeenCalledWith({
    data: { activityId: "sos-1", status: "resolved" },
  });
});

it("uses a compact dock bar so the chat stays usable during SOS", async () => {
  render(
    <InChatSos
      type="medical"
      lines={[{ number: "999" }, { number: "112" }]}
      threadId="thread-1"
      compact
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Activate SOS" }));

  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  vi.useRealTimers();

  expect(await screen.findByText("SOS live")).toBeTruthy();
  expect(screen.queryByTestId("live-map")).toBeNull();
  expect(screen.queryByText("Nearby help")).toBeNull();
  expect(screen.queryByText("Waiting for their location")).toBeNull();
  expect(getNearbyPlacesMock).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "Call 999 Police" }).getAttribute("href")).toBe("tel:999");
  expect(screen.getByRole("link", { name: "Call 112 Toll-free" }).getAttribute("href")).toBe("tel:112");
  expect(screen.getByRole("button", { name: /End SOS/ })).toBeTruthy();
});

it("keeps End SOS clickable when the details panel is closed", async () => {
  const onActivityEnded = vi.fn();
  render(
    <InChatSos
      type="medical"
      lines={[{ number: "999" }, { number: "112" }]}
      threadId="thread-1"
      detailsVisible={false}
      onActivityEnded={onActivityEnded}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Activate SOS" }));

  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  vi.useRealTimers();

  expect(await screen.findByRole("button", { name: /^End$/ })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Call 999 Police" }).getAttribute("href")).toBe("tel:999");
  expect(screen.queryByTestId("live-map")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^End$/ }));
  expect(await screen.findByText(/SOS ended/)).toBeTruthy();
  expect(onActivityEnded).toHaveBeenCalled();
});

it("keeps SOS on the same safety conversation instead of a blank emergency page", async () => {
  render(<InChatSos type="medical" lines={[{ number: "112" }]} />);

  fireEvent.click(screen.getByRole("button", { name: "Activate SOS" }));
  expect(screen.getByText(/Starting SOS in/)).toBeTruthy();
  expect(createThreadMock).toHaveBeenCalledWith("Safety conversation");
  expect(navigateMock).not.toHaveBeenCalled();

  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  vi.useRealTimers();

  expect(createThreadMock).toHaveBeenCalledWith("Safety conversation");
  expect(navigateMock).toHaveBeenCalledWith({
    to: "/chat/$threadId",
    params: { threadId: "emergency-thread-1" },
    replace: true,
  });
  expect(await screen.findByText("SOS activated")).toBeTruthy();
  expect(insertMock).toHaveBeenCalledWith(
    expect.objectContaining({
      details: expect.objectContaining({ thread_id: "emergency-thread-1" }),
    }),
  );
});

it("autoStart begins the cancellable countdown by itself, once", async () => {
  render(
    <InChatSos type="medical" lines={[{ number: "999" }]} threadId="thread-1" autoStart />,
  );
  await act(async () => {});
  expect(screen.getByText(/Starting SOS in/)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(screen.queryByText(/Starting SOS in/)).toBeNull();
  expect(screen.getByRole("button", { name: "Activate SOS" })).toBeTruthy();
  expect(insertMock).not.toHaveBeenCalled();
});

it("does not autoStart when an SOS is already active or the card is not managed by this user", async () => {
  render(
    <InChatSos
      type="medical"
      lines={[]}
      threadId="thread-1"
      existingActivityId="sos-9"
      existingActive
      autoStart
    />,
  );
  await act(async () => {});
  expect(screen.queryByText(/Starting SOS in/)).toBeNull();
  cleanup();

  render(<InChatSos type="medical" lines={[]} threadId="thread-1" canManage={false} autoStart />);
  await act(async () => {});
  expect(screen.queryByText(/Starting SOS in/)).toBeNull();
});

it("still activates SOS when the emergency thread is not ready on the first try", async () => {
  const onEnsureThread = vi
    .fn<() => Promise<string>>()
    .mockRejectedValueOnce(new Error("network"))
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValue("thread-ok");
  render(
    <InChatSos type="medical" lines={[{ number: "999" }]} threadId={null} onEnsureThread={onEnsureThread} autoStart />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  vi.useRealTimers();
  expect(await screen.findByText("SOS activated")).toBeTruthy();
  expect(screen.queryByText("SOS activation failed")).toBeNull();
});

it("tells the user plainly when phone alerts are switched off on the server", async () => {
  notifyMock.mockResolvedValue({ delivered: 0, devices: 0, recipients: 2, pushConfigured: false });
  const { toast } = await import("sonner");
  const message = vi.spyOn(toast, "message").mockImplementation(() => "" as never);
  render(<InChatSos type="medical" lines={[]} threadId="thread-1" immediateActivation />);
  fireEvent.click(screen.getByRole("button", { name: "Activate SOS" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
  vi.useRealTimers();
  await screen.findByText("SOS activated");
  expect(message).toHaveBeenCalledWith(expect.stringContaining("switched off on the server"));
  message.mockRestore();
});
