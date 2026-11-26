import { describe, expect, it } from "vitest";
import { bookingOutcomeText, humanizeBookingStep, humanizeBookingSteps } from "./booking-progress";

describe("booking progress humanization", () => {
  it("rewrites robotic agent steps into live first-person status", () => {
    expect(humanizeBookingStep("Understanding booking request")).toMatch(/Reading your appointment/i);
    expect(humanizeBookingStep("Opening clinic website: https://jinjahospital.go.ug/")).toMatch(
      /Opening the clinic website/i,
    );
    expect(humanizeBookingStep("Find and click on appointment or booking option")).toMatch(
      /Looking for the appointment/i,
    );
    expect(humanizeBookingStep("Logging in to patient portal")).toMatch(/Logging in/i);
    expect(humanizeBookingStep("Filling the appointment form")).toMatch(/Filling in the appointment form/i);
  });

  it("maps a list of steps without dropping extras", () => {
    const out = humanizeBookingSteps([
      { label: "Starting browser booking agent…", status: "completed" },
      { label: "Custom clinic step", status: "running" },
    ]);
    expect(out[0].label).toMatch(/Starting the booking agent/i);
    expect(out[1].label).toBe("Custom clinic step");
  });
});

describe("bookingOutcomeText", () => {
  it("never claims a booking that was not confirmed", () => {
    const text = bookingOutcomeText({ success: true, booked: false, clinic_phone: "0778 984111" }, "Jemia Doctors Chambers", "tomorrow morning");
    expect(text).toContain("could not confirm a booking at Jemia Doctors Chambers");
    expect(text).toContain("0778 984111");
    expect(text).toContain("Nothing is reserved");
  });
  it("confirms only when booked", () => {
    const text = bookingOutcomeText({ booked: true }, "Jemia Doctors Chambers", "tomorrow morning");
    expect(text).toContain("went through");
    expect(text).toContain("tomorrow morning");
  });
});
