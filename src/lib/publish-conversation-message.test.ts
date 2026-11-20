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
        },
      ],
    });
  });
});
