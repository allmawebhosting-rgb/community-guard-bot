import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { slimMessagesForTransport } from "@/lib/chat-media";

function userWithDataImage(id: string, dataUrl: string): UIMessage {
  return {
    id,
    role: "user",
    parts: [
      { type: "text", text: "Look at this" },
      { type: "file", mediaType: "image/jpeg", filename: "shot.jpg", url: dataUrl },
    ],
  };
}

describe("slimMessagesForTransport", () => {
  it("keeps the latest user inline photo and drops older data URLs", () => {
    const old = userWithDataImage("1", `data:image/jpeg;base64,${"a".repeat(100)}`);
    const newest = userWithDataImage("2", `data:image/jpeg;base64,${"b".repeat(100)}`);
    const slim = slimMessagesForTransport([old, newest]);
    expect(slim[0].parts.some((part) => part.type === "file")).toBe(false);
    expect(slim[1].parts.some((part) => part.type === "file")).toBe(true);
  });

  it("drops an oversized latest inline photo so the request can still succeed", () => {
    const huge = userWithDataImage("1", `data:image/jpeg;base64,${"x".repeat(700_000)}`);
    const slim = slimMessagesForTransport([huge]);
    expect(slim[0].parts.some((part) => part.type === "file")).toBe(false);
  });
});
