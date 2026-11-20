import { describe, expect, it, vi } from "vitest";
import { publishConversationMessage } from "./publish-conversation-message";

describe("publishConversationMessage", () => {
  it("publishes through the durable shared-conversation RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const supabase = { rpc } as never;
    const error = await publishConversationMessage(supabase, {
      threadId: "thread-1",
      userId: "user-1",
      role: "user",
      parts: [{ type: "text", text: "My nose is bleeding." }],
      sdkMessageId: "msg-1",
    });
    expect(error).toBeNull();
    expect(rpc).toHaveBeenCalledWith("publish_conversation_messages", {
      p_thread_id: "thread-1",
      p_messages: [
        {
          sdk_message_id: "msg-1",
          role: "user",
          parts: [{ type: "text", text: "My nose is bleeding." }],
          user_id: "user-1",
          recipient: "allma",
        },
      ],
    });
  });

  it("stores responder-directed intent on the same conversation", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const error = await publishConversationMessage({ rpc } as never, {
      threadId: "thread-1",
      userId: "user-1",
      role: "user",
      parts: [{ type: "text", text: "Please come now." }],
      sdkMessageId: "msg-2",
      recipient: "responders",
    });
    expect(error).toBeNull();
    expect(rpc).toHaveBeenCalledWith(
      "publish_conversation_messages",
      expect.objectContaining({
        p_messages: [
          expect.objectContaining({
            recipient: "responders",
            sdk_message_id: "msg-2",
          }),
        ],
      }),
    );
  });
});
