import { describe, expect, it } from "vitest";
import {
  emailDraftNote,
  emailsIn,
  isEmailWriteAsk,
  trustedRecipient,
} from "./email-draft-intent";

describe("isEmailWriteAsk", () => {
  it.each([
    "Write an email to a nearby hospital",
    "Write an email to allmawebhosting@gmail.com asking about an appointment",
    "Can you draft an email for me?",
    "compose a mail to the clinic",
    "send an email to my brother",
    "email the hospital about my injury",
  ])("treats %s as an email write ask", (text) => {
    expect(isEmailWriteAsk(text)).toBe(true);
  });

  it.each([
    "email the clinic",
    "Book an appointment by email",
    "Send the appointment request by email",
    "Where is the nearest hospital?",
    "",
  ])("leaves %s to the other flows", (text) => {
    expect(isEmailWriteAsk(text)).toBe(false);
  });
});

describe("trustedRecipient", () => {
  const texts = { latest: "Write an email to a nearby hospital", conversation: "Write an email to a nearby hospital" };
  it("drops an address the user never typed", () => {
    expect(trustedRecipient("info@some-hospital.ug", texts)).toBeNull();
    expect(trustedRecipient(null, texts)).toBeNull();
  });
  it("keeps an address the user typed", () => {
    const typed = { latest: "Write to Dr@Clinic.org", conversation: "Write to Dr@Clinic.org" };
    expect(trustedRecipient("dr@clinic.org", typed)).toBe("dr@clinic.org");
    expect(trustedRecipient(null, typed)).toBe("dr@clinic.org");
  });
});

describe("helpers", () => {
  it("finds and dedupes addresses", () => {
    expect(emailsIn("a@b.co and A@B.co")).toEqual(["a@b.co"]);
  });
  it("tells the user what to do next", () => {
    expect(emailDraftNote(true)).toContain("Send from my Gmail");
    expect(emailDraftNote(false)).toContain("Connect Gmail");
  });
});
