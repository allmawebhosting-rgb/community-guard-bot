import type { UIMessage } from "ai";
import { normalizeChatRecipient } from "@/lib/chat-recipient";

export type SharedHistoryRow = {
  id: string;
  user_id: string;
  role: string;
  parts: unknown;
  sdk_message_id: string | null;
  created_at: string;
  recipient?: string | null;
};

/** Convert a persisted messages-table row into the UI message shape. */
export function sharedRowToUiMessage(row: SharedHistoryRow): UIMessage {
  return {
    id: row.sdk_message_id || row.id,
    role: row.role as UIMessage["role"],
    parts: (Array.isArray(row.parts) ? row.parts : []) as UIMessage["parts"],
    authorId: row.user_id,
    createdAt: row.created_at,
    recipient: normalizeChatRecipient(row.recipient),
  } as UIMessage;
}

/**
 * Build the canonical shared timeline: DB history is the source of truth,
 * then fold in any brand-new client messages (the just-typed user turn).
 */
export function mergeCanonicalChatHistory(
  databaseRows: SharedHistoryRow[],
  clientMessages: UIMessage[],
): UIMessage[] {
  const byId = new Map<string, UIMessage>();
  for (const row of databaseRows) {
    const message = sharedRowToUiMessage(row);
    byId.set(message.id, message);
  }
  for (const message of clientMessages) {
    if (!byId.has(message.id)) byId.set(message.id, message);
  }
  return [...byId.values()].sort((left, right) => {
    const leftDate = (left as UIMessage & { createdAt?: string | Date }).createdAt;
    const rightDate = (right as UIMessage & { createdAt?: string | Date }).createdAt;
    const leftTime = leftDate ? new Date(leftDate).getTime() : Number.MAX_SAFE_INTEGER;
    const rightTime = rightDate ? new Date(rightDate).getTime() : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime;
  });
}

/** True when the shared DB already has Allma history — never treat as a fresh greeting. */
export function sharedThreadHasAssistantHistory(rows: SharedHistoryRow[]) {
  return rows.some((row) => row.role === "assistant");
}
