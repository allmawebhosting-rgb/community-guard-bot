import { describe, expect, it } from "vitest";
import {
  mergeCanonicalChatHistory,
  sharedRowToUiMessage,
  sharedThreadHasAssistantHistory,
} from "./shared-chat-history";
import type { UIMessage } from "ai";

describe("shared chat history", () => {
  it("keeps the database timeline as the single source of truth", () => {
    const merged = mergeCanonicalChatHistory(
      [
        {
          id: "db-1",
          user_id: "owner",
          role: "user",
          parts: [{ type: "text", text: "My nose is bleeding." }],
          sdk_message_id: "u1",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "db-2",
          user_id: "owner",
          role: "assistant",
          parts: [{ type: "text", text: "Apply pressure." }],
          sdk_message_id: "a1",
          created_at: "2026-01-01T00:00:01Z",
        },
      ],
      [
        {
          id: "u2",
          role: "user",
          parts: [{ type: "text", text: "I've received your SOS." }],
        } as UIMessage,
      ],
    );

    expect(merged.map((message) => message.id)).toEqual(["u1", "a1", "u2"]);
    expect((merged[0] as UIMessage & { authorId?: string }).authorId).toBe("owner");
  });

  it("does not duplicate ids already present in the database", () => {
    const merged = mergeCanonicalChatHistory(
      [
        {
          id: "db-1",
          user_id: "owner",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
          sdk_message_id: "same",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      [{ id: "same", role: "user", parts: [{ type: "text", text: "Hello" }] } as UIMessage],
    );
    expect(merged).toHaveLength(1);
    expect(sharedRowToUiMessage({
      id: "x",
      user_id: "r1",
      role: "user",
      parts: [],
      sdk_message_id: null,
      created_at: "2026-01-01T00:00:00Z",
    }).id).toBe("x");
  });

  it("detects existing assistant history so greeting mode stays off", () => {
    expect(
      sharedThreadHasAssistantHistory([
        {
          id: "1",
          user_id: "owner",
          role: "assistant",
          parts: [],
          sdk_message_id: "a",
          created_at: "2026-01-01T00:00:00Z",
        },
      ]),
    ).toBe(true);
    expect(sharedThreadHasAssistantHistory([])).toBe(false);
  });
});
