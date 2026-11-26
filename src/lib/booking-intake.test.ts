import { describe, expect, it } from "vitest";
import { isBookingOpenerMessage } from "./chat-intent";
import {
  clinicContactQuestion,
  deriveBookingSlots,
  nextBookingQuestion,
  pendingBookingAsk,
  splitTimeAndReason,
} from "./booking-intake";

const OPENER =
  "I can book a hospital or clinic appointment for you.\n\nWhich clinic or hospital should I use, and when do you want to go?";

describe("booking intake", () => {
  it("splits time from reason", () => {
    expect(splitTimeAndReason("Tomorrow morning checkup")).toEqual({ time: "tomorrow morning", reason: "checkup" });
    expect(splitTimeAndReason("tomorrow at 10am")).toMatchObject({ time: "tomorrow at 10am" });
  });

  it("keeps the clinic the user named and asks for the name next", () => {
    const slots = deriveBookingSlots([
      { role: "assistant", text: OPENER },
      { role: "user", text: "Jemia Doctors Chambers" },
      { role: "assistant", text: "Got it — I'll use **Jemia Doctors Chambers**." },
      { role: "user", text: "Tomorrow morning checkup" },
    ]);
    expect(slots).toMatchObject({ clinic: "Jemia Doctors Chambers", time: "tomorrow morning", reason: "checkup" });
    const ask = nextBookingQuestion(slots, null);
    expect(ask).toMatch(/what name should the booking be under/i);
    expect(isBookingOpenerMessage(ask)).toBe(true);
  });

  it("uses profile details instead of asking again", () => {
    const slots = { clinic: "X Clinic", time: "today", reason: "fever" };
    expect(nextBookingQuestion(slots, { fullName: "Air", phone: "+256700000000" })).toBeNull();
    expect(nextBookingQuestion(slots, { fullName: "Air" })).toMatch(/phone number/i);
  });

  it("reads a bare name and phone reply from the question asked", () => {
    const turns = [
      { role: "assistant" as const, text: OPENER },
      { role: "user" as const, text: "Jemia Doctors Chambers" },
      { role: "user" as const, text: "Tomorrow morning checkup" },
      { role: "assistant" as const, text: "Almost there. What name should the booking be under? The clinic form needs it to book your appointment." },
      { role: "user" as const, text: "Air preach" },
      { role: "assistant" as const, text: "Thanks, Air. Which phone number can the clinic reach you on? They usually call to confirm." },
      { role: "user" as const, text: "0778 984 111" },
    ];
    const slots = deriveBookingSlots(turns);
    expect(slots.patientName).toBe("Air preach");
    expect(slots.phone).toBe("0778984111");
    expect(nextBookingQuestion(slots, null)).toBeNull();
  });

  it("captures clinic contact answers", () => {
    const base = [
      { role: "assistant" as const, text: OPENER },
      { role: "user" as const, text: "Jemia Doctors Chambers" },
      { role: "assistant" as const, text: clinicContactQuestion("Jemia Doctors Chambers") },
    ];
    expect(pendingBookingAsk(base[2].text)).toBe("clinic_contact");
    expect(deriveBookingSlots([...base, { role: "user", text: "jemiadoctors.co.ug" }]).website).toBe("https://jemiadoctors.co.ug");
    expect(deriveBookingSlots([...base, { role: "user", text: "0414 123 456" }]).clinicPhone).toBe("0414123456");
    expect(deriveBookingSlots([...base, { role: "user", text: "I do not have it" }]).noClinicContact).toBe(true);
  });
});
