export type ChatRecipient = "allma" | "responders";

export function normalizeChatRecipient(value: unknown): ChatRecipient {
  return value === "responders" ? "responders" : "allma";
}

export function chatRecipientLabel(recipient: ChatRecipient) {
  return recipient === "responders" ? "To Responders" : "To Allma AI";
}
