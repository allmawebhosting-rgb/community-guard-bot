import { describe, expect, it } from "vitest";
import {
  chatRecipientLabel,
  normalizeChatRecipient,
  resolveMessageRecipient,
} from "./chat-recipient";

describe("chat recipient", () => {
  it("defaults unknown values to Allma", () => {
    expect(normalizeChatRecipient(undefined)).toBe("allma");
    expect(normalizeChatRecipient("ai")).toBe("allma");
    expect(normalizeChatRecipient("responders")).toBe("responders");
  });

  it("labels recipient intent for the shared timeline", () => {
    expect(chatRecipientLabel("allma")).toBe("To: Allma AI");
    expect(chatRecipientLabel("responders")).toBe("To: Safety Responders");
  });

  it("resolves recipient from body and message metadata, never text", () => {
    expect(
      resolveMessageRecipient({
        bodyRecipient: "responders",
        message: {
          parts: [{ type: "text", text: "Ask Allma what to do" }],
        },
      }),
    ).toBe("responders");

    expect(
      resolveMessageRecipient({
        bodyRecipient: "allma",
        message: {
          metadata: { recipient: "responders" },
          parts: [{ type: "text", text: "hello" }],
        },
      }),
    ).toBe("responders");

    expect(
      resolveMessageRecipient({
        message: {
          parts: [
            { type: "data-chat-recipient", data: { recipient: "responders" } },
            { type: "text", text: "Need help now" },
          ],
        },
      }),
    ).toBe("responders");
  });
});
