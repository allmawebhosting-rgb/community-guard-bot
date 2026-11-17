import type { UIMessage } from "ai";

const keyFor = (threadId: string) => `allma.pendingChatMessages.${threadId}`;

/** Park the open conversation so SOS can open the same thread without losing messages. */
export function stashPendingChatMessages(threadId: string, messages: UIMessage[]) {
  if (typeof window === "undefined" || !threadId || messages.length === 0) return;
  try {
    window.sessionStorage.setItem(
      keyFor(threadId),
      JSON.stringify(
        messages.map((message) => ({
          id: message.id,
          role: message.role,
          parts: message.parts,
          createdAt: (message as UIMessage & { createdAt?: string | Date }).createdAt ?? null,
          authorId: (message as UIMessage & { authorId?: string }).authorId ?? null,
        })),
      ),
    );
  } catch {
    // sessionStorage can be full or blocked; SOS can still start without the handoff.
  }
}

export function takePendingChatMessages(threadId: string): UIMessage[] {
  if (typeof window === "undefined" || !threadId) return [];
  try {
    const raw = window.sessionStorage.getItem(keyFor(threadId));
    if (!raw) return [];
    window.sessionStorage.removeItem(keyFor(threadId));
    const parsed = JSON.parse(raw) as Array<{
      id?: string;
      role?: UIMessage["role"];
      parts?: UIMessage["parts"];
      createdAt?: string | Date | null;
      authorId?: string | null;
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row) => row && typeof row.id === "string" && row.role && Array.isArray(row.parts))
      .map(
        (row) =>
          ({
            id: row.id!,
            role: row.role!,
            parts: row.parts!,
            ...(row.createdAt ? { createdAt: row.createdAt } : {}),
            ...(row.authorId ? { authorId: row.authorId } : {}),
          }) as UIMessage,
      );
  } catch {
    return [];
  }
}
