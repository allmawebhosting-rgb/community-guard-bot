import { emailsIn, isEmailWriteAsk } from "@/lib/email-draft-intent";

export type EmailTurn = { role: "user" | "assistant"; text: string };
export type EmailAsk = "recipient" | "purpose";

export type EmailSlots = {
  started: boolean;
  recipient?: string;
  purpose?: string;
  /** A sentence the draft composer understands, built from the answers. */
  askText: string;
};

const ASK_PATTERNS: Array<[EmailAsk, RegExp]> = [
  ["recipient", /who is this email for\?/i],
  ["purpose", /what should the email say\?/i],
];

export function pendingEmailAsk(lastAssistantText: string | null | undefined): EmailAsk | null {
  const text = lastAssistantText || "";
  for (const [ask, pattern] of ASK_PATTERNS) if (pattern.test(text)) return ask;
  return null;
}

const PURPOSE_IN_ASK = /\b(about|regarding|asking|to ask|saying|telling|because|requesting|that)\b\s+(\S.{3,})$/i;
const RECIPIENT_IN_ASK = /\b(?:email|mail)\s+(?:to|for)\s+(.+?)(?:\s+(?:about|regarding|asking|to ask|saying|telling|because|requesting|that)\b|$)/i;

function cleanPurpose(text: string | undefined): string | undefined {
  const value = (text ?? "")
    .replace(/[.!?]+$/, "")
    .replace(/^(ask(ing)?\s+)?(about|for|regarding)\s+/i, "")
    .replace(/^ask(ing)?\s+/i, "")
    .trim();
  return value || undefined;
}

function cleanRecipient(text: string | undefined): string | undefined {
  const value = (text ?? "").replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim();
  if (!value || value.length > 80) return undefined;
  if (/^(them|him|her|it|us|me|someone|somebody)$/i.test(value)) return undefined;
  return value;
}

export function deriveEmailSlots(turns: EmailTurn[], recipientFromContext: boolean): EmailSlots {
  let start = -1;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === "user" && isEmailWriteAsk(turns[i].text) && !pendingEmailAsk(turns[i - 1]?.text)) {
      start = i;
      break;
    }
  }
  if (start === -1) return { started: false, askText: "" };

  const first = turns[start].text.trim();
  let recipient = emailsIn(first)[0] ?? cleanRecipient(first.match(RECIPIENT_IN_ASK)?.[1]);
  let purpose = cleanPurpose(first.match(PURPOSE_IN_ASK)?.[2]);

  for (let i = start + 1; i < turns.length; i++) {
    if (turns[i].role !== "user") continue;
    const pending = pendingEmailAsk(turns[i - 1]?.text);
    const text = turns[i].text.trim();
    if (pending === "recipient") recipient = emailsIn(text)[0] ?? cleanRecipient(text) ?? recipient;
    if (pending === "purpose") purpose = cleanPurpose(text) ?? purpose;
  }
  if (!recipient && recipientFromContext) recipient = "the nearest hospital";

  const askText = `Write an email to ${recipient ?? "them"}${purpose ? ` about ${purpose}` : ""}`;
  return { started: true, recipient, purpose, askText };
}

export function nextEmailQuestion(slots: EmailSlots): string | null {
  if (!slots.started) return null;
  if (!slots.recipient) {
    return "Who is this email for? Type their email address, or a name like a clinic or a person.\n\n::suggest[Nearest hospital | Jinja Main Hospital | Cancel]";
  }
  if (!slots.purpose) {
    return `What should the email say? Give me the reason and any details, like when, what happened, or your question.\n\n::suggest[Ask about appointment availability | Ask for medical help | Cancel]`;
  }
  return null;
}
