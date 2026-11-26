import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const arm = vi.fn();
const advance = vi.fn();
const cancel = vi.fn();
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/emergency-contact.functions", () => ({
  armEmergencyContact: (...a: unknown[]) => arm(...a),
  advanceEmergencyContact: (...a: unknown[]) => advance(...a),
  cancelEmergencyContact: (...a: unknown[]) => cancel(...a),
}));

import { EmergencyContactCard, formatDistance, secondsLeft } from "./emergency-contact-card";
import type { EmergencyRunView } from "@/lib/emergency-contact.server";

const RUN = "11111111-1111-4111-8111-111111111111";
const base = (over: Partial<EmergencyRunView> = {}): EmergencyRunView => ({
  run_id: RUN,
  status: "countdown",
  countdown_seconds: 10,
  countdown_ends_at: null,
  server_now: new Date().toISOString(),
  incident: "Road / boda boda accident",
  place: "Jinja",
  location_source: "town",
  email_via: "allma",
  gmail_email: null,
  facilities: [
    { name: "Jinja Hospital", address: "Main St", distance_m: 850, phone: "256414123456", email: "info@jinja.go.ug", open_note: "Open 24 hours" },
  ],
  actions: [
    { id: "a1", seq: 1, channel: "email", facility_name: "Jinja Hospital", facility_address: null, distance_m: 850, destination: "info@jinja.go.ug", status: "pending", detail: null },
    { id: "a2", seq: 2, channel: "call", facility_name: "Jinja Hospital", facility_address: null, distance_m: 850, destination: "256414123456", status: "pending", detail: null },
  ],
  ...over,
});

describe("helpers", () => {
  it("formats distances and counts down from the server clock", () => {
    expect(formatDistance(850)).toBe("850 m");
    expect(formatDistance(2200)).toBe("2.2 km");
    const view = { countdown_ends_at: "2026-01-01T00:00:10.000Z", server_now: "2026-01-01T00:00:00.000Z" };
    const t0 = new Date("2026-01-01T00:00:00.000Z").getTime();
    expect(secondsLeft(view, 0, t0)).toBe(10);
    expect(secondsLeft(view, 0, t0 + 9_100)).toBe(1);
    expect(secondsLeft(view, 0, t0 + 20_000)).toBe(0);
    expect(secondsLeft({ countdown_ends_at: null, server_now: "" }, 0)).toBeNull();
  });
});

describe("EmergencyContactCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    arm.mockReset();
    advance.mockReset();
    cancel.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the countdown, facilities with numbers and emails, and a big Cancel", async () => {
    arm.mockResolvedValue(base({ countdown_ends_at: new Date(Date.now() + 10_000).toISOString(), server_now: new Date().toISOString() }));
    render(<EmergencyContactCard run={base()} />);
    await act(async () => {});
    expect(screen.getByText(/Contacting nearby hospitals in 10 s/)).toBeTruthy();
    expect(screen.getByText("Jinja Hospital")).toBeTruthy();
    expect(screen.getByText("info@jinja.go.ug")).toBeTruthy();
    expect(screen.getByText("+256414123456")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(advance).not.toHaveBeenCalled();
  });

  it("starts contacting only after the countdown reaches zero", async () => {
    const ends = new Date(Date.now() + 10_000).toISOString();
    arm.mockResolvedValue(base({ countdown_ends_at: ends }));
    advance.mockResolvedValue(base({ status: "completed", countdown_ends_at: ends, actions: base().actions.map((a) => ({ ...a, status: a.channel === "call" ? "answered" : "sent" })) }));
    render(<EmergencyContactCard run={base()} />);
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(9_000);
    });
    expect(advance).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1_500);
    });
    await act(async () => {});
    expect(advance).toHaveBeenCalledWith({ data: { runId: RUN } });
    expect(screen.getByText("Nearby hospitals have been contacted")).toBeTruthy();
    expect(screen.getByText(/Call answered/)).toBeTruthy();
    expect(screen.getByText(/Email sent/)).toBeTruthy();
    expect(screen.getByText(/Gmail is not connected, so emails go from Allma's own system email/)).toBeTruthy();
  });

  it("cancel stops the run and nothing is advanced", async () => {
    const ends = new Date(Date.now() + 10_000).toISOString();
    arm.mockResolvedValue(base({ countdown_ends_at: ends }));
    cancel.mockResolvedValue(base({ status: "cancelled", countdown_ends_at: ends, actions: base().actions.map((a) => ({ ...a, status: "cancelled", detail: "Cancelled by you" })) }));
    render(<EmergencyContactCard run={base()} />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    expect(cancel).toHaveBeenCalledWith({ data: { runId: RUN } });
    expect(screen.getByText("Contacting hospitals was cancelled")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(advance).not.toHaveBeenCalled();
  });

  it("shows a searching state before facilities are known", () => {
    render(<EmergencyContactCard run={null} />);
    expect(screen.getByText(/Finding the nearest hospitals/)).toBeTruthy();
  });
});

describe("EmergencyContactCard sequencing and live status", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    arm.mockReset();
    advance.mockReset();
    cancel.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const armed = () => base({ countdown_ends_at: new Date(Date.now() + 10_000).toISOString() });

  it("waits for SOS before arming the hospital countdown", async () => {
    arm.mockResolvedValue(armed());
    const { rerender } = render(
      <EmergencyContactCard run={base()} waitForSos={{ sosActive: false, maxWaitMs: 12_000 }} />,
    );
    await act(async () => {});
    expect(arm).not.toHaveBeenCalled();
    expect(screen.getByText("Nearby help comes last")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();

    rerender(<EmergencyContactCard run={base()} waitForSos={{ sosActive: true, maxWaitMs: 12_000 }} />);
    await act(async () => {});
    expect(arm).toHaveBeenCalledTimes(1);
  });

  it("does not hold the hospitals forever when SOS never starts", async () => {
    arm.mockResolvedValue(armed());
    render(<EmergencyContactCard run={base()} waitForSos={{ sosActive: false, maxWaitMs: 12_000 }} />);
    await act(async () => {});
    expect(arm).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(12_100);
    });
    expect(arm).toHaveBeenCalledTimes(1);
  });

  it("shows who was alerted, who answered and which hospital was contacted", async () => {
    const ends = new Date(Date.now() + 10_000).toISOString();
    arm.mockResolvedValue(
      base({
        status: "completed",
        countdown_ends_at: ends,
        actions: base().actions.map((a) => ({ ...a, status: a.channel === "call" ? "answered" : "sent" })),
      }),
    );
    render(<EmergencyContactCard run={base()} network={{ sosActive: true, answered: ["Sarah"] }} />);
    await act(async () => {});
    const status = screen.getByLabelText("Live status");
    expect(status.textContent).toContain("Your emergency contacts and safety network");
    expect(status.textContent).toContain("Sarah");
    expect(status.textContent).toContain("Jinja Hospital: answered the call, emailed");
  });

  it("says nobody has answered yet", async () => {
    arm.mockResolvedValue(armed());
    render(<EmergencyContactCard run={base()} network={{ sosActive: false, answered: [] }} />);
    await act(async () => {});
    const status = screen.getByLabelText("Live status");
    expect(status.textContent).toContain("Starting SOS");
    expect(status.textContent).toContain("No one yet");
    expect(status.textContent).toContain("Not contacted yet");
  });
});

describe("callDetailText", () => {
  it("hides raw provider 401 errors behind a plain sentence", async () => {
    const { callDetailText } = await import("./emergency-contact-card");
    expect(callDetailText({ channel: "call", status: "failed", detail: "Call provider error 401" })).toBe(
      "The calling service is not available right now, so no call was placed.",
    );
    expect(callDetailText({ channel: "call", status: "no_answer", detail: "Rang 30 s" })).toBe("Rang 30 s");
  });

  it("offers a tap-to-call link when the automatic call failed", async () => {
    arm.mockResolvedValue(
      base({
        status: "completed",
        countdown_ends_at: new Date(Date.now() + 10_000).toISOString(),
        actions: base().actions.map((a) =>
          a.channel === "call" ? { ...a, status: "failed", detail: "Call provider error 401" } : { ...a, status: "sent" },
        ),
      }),
    );
    render(<EmergencyContactCard run={base()} />);
    await act(async () => {});
    const link = screen.getByRole("link", { name: /Call Jinja Hospital yourself/ });
    expect(link.getAttribute("href")).toBe("tel:+256414123456");
  });
});
