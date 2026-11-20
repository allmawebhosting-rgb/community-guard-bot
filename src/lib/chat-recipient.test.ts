import { describe, expect, it } from "vitest";
import { chatRecipientLabel, normalizeChatRecipient } from "./chat-recipient";

describe("chat recipient", () => {
  it("defaults unknown values to Allma", () => {
    expect(normalizeChatRecipient(undefined)).toBe("allma");
    expect(normalizeChatRecipient("responders")).toBe("responders");
  });

  it("labels recipient intent for the shared timeline", () => {
    expect(chatRecipientLabel("allma")).toBe("To Allma AI");
    expect(chatRecipientLabel("responders")).toBe("To Responders");
  });
});
