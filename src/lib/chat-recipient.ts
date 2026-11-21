export type ChatRecipient = "allma" | "responders";

/** Accept stored aliases (`ai` / `allma`, `responders` / `human`). */
export function normalizeChatRecipient(value: unknown): ChatRecipient {
  if (value === "responders" || value === "human" || value === "safety_responders") {
    return "responders";
  }
  return "allma";
}

export function chatRecipientLabel(recipient: ChatRecipient) {
  return recipient === "responders" ? "To: Safety Responders" : "To: Allma AI";
}

export function chatRecipientShortLabel(recipient: ChatRecipient) {
  return recipient === "responders" ? "Safety Responders" : "Allma AI";
}

/** Resolve recipient from request body + message metadata (never from message text). */
export function resolveMessageRecipient(args: {
  bodyRecipient?: unknown;
  message?: { metadata?: unknown; recipient?: unknown; parts?: unknown } | null;
}): ChatRecipient {
  const meta =
    args.message &&
    typeof args.message.metadata === "object" &&
    args.message.metadata &&
    "recipient" in (args.message.metadata as object)
      ? (args.message.metadata as { recipient?: unknown }).recipient
      : undefined;

  const direct = args.message?.recipient;

  let partRecipient: unknown;
  if (Array.isArray(args.message?.parts)) {
    for (const part of args.message.parts) {
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "data-chat-recipient" &&
        "data" in part
      ) {
        const data = (part as { data?: { recipient?: unknown } }).data;
        partRecipient = data?.recipient;
        break;
      }
    }
  }

  // If any explicit signal says responders, never invoke Allma.
  const signals = [args.bodyRecipient, direct, meta, partRecipient];
  if (signals.some((value) => normalizeChatRecipient(value) === "responders")) {
    return "responders";
  }
  return "allma";
}
