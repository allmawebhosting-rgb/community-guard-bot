import { describe, expect, it } from "vitest";
import { type EmailTurn, deriveEmailSlots, nextEmailQuestion, pendingEmailAsk } from "./email-intake";

describe("email intake", () => {
  it("asks who first, then what, then drafts", () => {
    let turns: EmailTurn[] = [{ role: "user", text: "Write an email" }];
    let slots = deriveEmailSlots(turns, false);
    const q1 = nextEmailQuestion(slots)!;
    expect(pendingEmailAsk(q1)).toBe("recipient");

    turns = [...turns, { role: "assistant", text: q1 }, { role: "user", text: "Jinja Main Hospital" }];
    slots = deriveEmailSlots(turns, false);
    const q2 = nextEmailQuestion(slots)!;
    expect(pendingEmailAsk(q2)).toBe("purpose");

    turns = [...turns, { role: "assistant", text: q2 }, { role: "user", text: "ask about appointment availability tomorrow" }];
    slots = deriveEmailSlots(turns, false);
    expect(nextEmailQuestion(slots)).toBeNull();
    expect(slots.askText).toBe("Write an email to Jinja Main Hospital about appointment availability tomorrow");
  });

  it("skips steps the ask already answers", () => {
    const slots = deriveEmailSlots(
      [{ role: "user", text: "Write an email to info@jinjahospital.org asking about visiting hours" }],
      false,
    );
    expect(slots.recipient).toBe("info@jinjahospital.org");
    expect(slots.purpose).toBe("visiting hours");
    expect(nextEmailQuestion(slots)).toBeNull();
  });

  it("uses the places already shown as the recipient", () => {
    const slots = deriveEmailSlots([{ role: "user", text: "Write them an email" }], true);
    expect(slots.recipient).toBe("the nearest hospital");
    expect(nextEmailQuestion(slots)).toMatch(/what should the email say/i);
  });
});
