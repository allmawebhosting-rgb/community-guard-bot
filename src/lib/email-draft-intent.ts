import { isBookingEmailAsk, isHospitalEmailDraftAsk } from "@/lib/chat-intent";

const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** "Write / draft / compose an email…" or "send an email…" — an explicit ask for a written email. */
function isExplicitEmailWriteAsk(text: string) {
  return (
    /\b(write|draft|compose)\b[^.!?\n]{0,40}\b(e-?mail|mail)\b/i.test(text) ||
    /\b(prepare|create|type)\s+(an?\s+|the\s+|my\s+)?e-?mail\b/i.test(text) ||
    /\bsend\s+(an?\s+|the\s+|my\s+)?e-?mail\b/i.test(text)
  );
}

/**
 * The user wants Allma to write an email for them. This turn answers with the editable
 * email draft card. Plain "email the clinic" inside the appointment flow is NOT this: that
 * stays with booking.
 */
export function isEmailWriteAsk(text: string) {
  const t = text.trim();
  if (!t) return false;
  if (isExplicitEmailWriteAsk(t)) return true;
  return isHospitalEmailDraftAsk(t) && !isBookingEmailAsk(t);
}

export function emailsIn(text: string): string[] {
  return [...new Set((text.match(EMAIL_IN_TEXT) ?? []).map((address) => address.toLowerCase()))];
}

/**
 * The recipient is only ever an address the user typed. If the model offers any other
 * address it is dropped, and the card asks the user to type one.
 */
export function trustedRecipient(
  modelTo: string | null | undefined,
  userTexts: { latest: string; conversation: string },
): string | null {
  const typedByUser = new Set(emailsIn(userTexts.conversation));
  const candidate = (modelTo ?? "").trim().toLowerCase();
  if (candidate && typedByUser.has(candidate)) return candidate;
  return emailsIn(userTexts.latest)[0] ?? null;
}

export type EmailDraftOutput = {
  draft: true;
  sent: false;
  to: string | null;
  recipient_name: string | null;
  subject: string;
  body: string;
};

function topicOf(text: string) {
  const match = text.match(/\b(?:about|regarding|asking|to ask|saying|that|for)\b\s+(.{4,200})$/i);
  const topic = (match?.[1] ?? "").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  return topic || null;
}

/** Deterministic draft used when the model returns no usable draft. Never invents an address. */
export function fallbackEmailDraft(input: {
  text: string;
  hospitalName?: string | null;
  area?: string | null;
}): EmailDraftOutput {
  const to = emailsIn(input.text)[0] ?? null;
  const hospital = isHospitalEmailDraftAsk(input.text) || Boolean(input.hospitalName);
  const area = (input.area ?? "").trim();
  if (hospital) {
    const name = (input.hospitalName ?? "").trim();
    return {
      draft: true,
      sent: false,
      to,
      recipient_name: name || null,
      subject: `Request for medical assistance${area ? ` - ${area}` : ""}`,
      body: [
        `Dear ${name || "Hospital"} team,`,
        "",
        "I am writing to ask for medical help. My name is [your name] and I can be reached on [your phone number].",
        "The patient is [name / age] and the problem is: [describe symptoms or injury and when it started].",
        `We are currently ${area ? `in ${area}` : "at [your location]"}.`,
        "",
        "Please let me know what to do next and whether you can receive the patient.",
        "",
        "Thank you,",
        "[your name]",
      ].join("\n"),
    };
  }
  const topic = topicOf(input.text);
  return {
    draft: true,
    sent: false,
    to,
    recipient_name: null,
    subject: topic ? topic.charAt(0).toUpperCase() + topic.slice(1, 80) : "Hello",
    body: [
      "Hello,",
      "",
      topic ? `I am writing about ${topic}.` : "[write your message here]",
      "",
      "Kind regards,",
      "[your name]",
    ].join("\n"),
  };
}

/** One short line under the card; says what to do next based on the server-side Gmail status. */
export function emailDraftNote(gmailConnected: boolean) {
  return gmailConnected
    ? "Here is your draft. Check who it is going to, edit anything you like, then tap **Send from my Gmail**. Nothing is sent until you do."
    : "Here is your draft. Tap **Connect Gmail** on the card (or in Profile) so it can go out from your own address, then review it and tap Send. Nothing is sent until you do.";
}
