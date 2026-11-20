import type { SupabaseClient } from "@supabase/supabase-js";

/** Persist one turn into the shared conversation via the durable RPC (not broken upsert). */
export async function publishConversationMessage(
  supabase: SupabaseClient,
  args: {
    threadId: string;
    userId: string;
    role: string;
    parts: unknown;
    sdkMessageId: string;
  },
) {
  const { error } = await (supabase as any).rpc("publish_conversation_messages", {
    p_thread_id: args.threadId,
    p_messages: [
      {
        sdk_message_id: args.sdkMessageId,
        role: args.role,
        parts: args.parts,
        user_id: args.userId,
      },
    ],
  });
  return error;
}
