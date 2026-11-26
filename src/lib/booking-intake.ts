import { bookingClinicAckReply, bookingHasPreferredTime, looksLikeClinicName } from "@/lib/chat-intent";

export type BookingSlots = {
  clinic?: string;
  time?: string;
  reason?: string;
  patientName?: string;
  phone?: string;
  website?: string;
  clinicPhone?: string;
  /** The user said they have no website or number for the clinic. */
  noClinicContact?: boolean;
};

export type BookingTurn = { role: "user" | "assistant"; text: string };

export type BookingAsk = "clinic" | "time" | "reason" | "name" | "phone" | "clinic_contact";

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s]+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|ug|co\.ug|go\.ug|or\.ug|health)(?:\/[^\s]*)?)/i;
const PHONE_RE = /(?:\+?256[\s-]*)?0?\d{3}[\s-]?\d{3}[\s-]?\d{3,4}|\+\d{10,15}/;
const TIME_WORDS_RE =
  /\b(tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this (?:morning|afternoon|evening)|(?:in the )?(?:morning|afternoon|evening)|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}(?:st|nd|rd|th)(?:\s+of)?\s+\w+)\b/gi;
const NO_CONTACT_RE = /^(no|none|nope|i (do not|don'?t) (have|know)( (it|them|any))?|not sure|no idea|skip)[.!]?$/i;

export const BOOKING_ASK_PATTERNS: Array<[BookingAsk, RegExp]> = [
  ["name", /what name should the booking be under/i],
  ["phone", /which phone number can the clinic reach you on/i],
  ["clinic_contact", /website or phone number for/i],
  ["reason", /what is the visit for\?/i],
  ["time", /when would you like to go to/i],
  ["clinic", /which hospital or clinic should i book/i],
];

/** Which question Allma asked last, so a bare reply like "Air preach" lands in the right slot. */
export function pendingBookingAsk(lastAssistantText: string | null | undefined): BookingAsk | null {
  const text = lastAssistantText || "";
  for (const [ask, pattern] of BOOKING_ASK_PATTERNS) {
    if (pattern.test(text)) return ask;
  }
  return null;
}

export function splitTimeAndReason(text: string): { time?: string; reason?: string } {
  const source = text.trim().replace(/\s+/g, " ");
  const matches = [...source.matchAll(TIME_WORDS_RE)].map((match) => match[0]);
  if (!matches.length) return { reason: source || undefined };
  const time = matches.join(" ").replace(/\s+/g, " ").trim().toLowerCase();
  const reason = source
    .replace(TIME_WORDS_RE, " ")
    .replace(/\b(for|a|an|the|my|please|i want|i need|i would like|to see|appointment|book|at|on)\b/gi, " ")
    .replace(/[,.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { time, reason: reason || undefined };
}

function cleanName(text: string): string | null {
  const name = text
    .trim()
    .replace(/^(my name is|it'?s|its|i am|i'm|under|book (it )?(under|for))\s+/i, "")
    .replace(/[.!]+$/, "")
    .trim();
  if (name.length < 2 || name.length > 60) return null;
  if (!/^[\p{L}][\p{L} .'-]*$/u.test(name)) return null;
  return name;
}

function normalizePhone(text: string): string | null {
  const match = text.match(PHONE_RE);
  if (!match) return null;
  const digits = match[0].replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 9 ? digits : null;
}

/** Rebuild what the user has told us for the booking in progress, from the thread itself. */
export function deriveBookingSlots(turns: BookingTurn[]): BookingSlots {
  let start = -1;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === "assistant" && /I can book a hospital or clinic appointment/i.test(turns[i].text)) {
      start = i;
      break;
    }
  }
  const slots: BookingSlots = {};
  if (start === -1) return slots;

  for (let i = start + 1; i < turns.length; i++) {
    const turn = turns[i];
    if (turn.role !== "user") continue;
    const text = turn.text.trim();
    if (!text) continue;
    const prevAssistant = [...turns.slice(start, i)].reverse().find((entry) => entry.role === "assistant");
    const pending = pendingBookingAsk(prevAssistant?.text);

    if (/^try another clinic\b|^different clinic\b/i.test(text)) {
      delete slots.clinic;
      delete slots.website;
      delete slots.clinicPhone;
      delete slots.noClinicContact;
      continue;
    }
    if (/^different (time|day)\b/i.test(text)) {
      delete slots.time;
      continue;
    }

    if (pending === "name") {
      const name = cleanName(text);
      if (name) slots.patientName = name;
      continue;
    }
    if (pending === "phone") {
      const phone = normalizePhone(text);
      if (phone) slots.phone = phone;
      continue;
    }
    if (pending === "clinic_contact") {
      const site = text.match(URL_RE)?.[1];
      const phone = normalizePhone(text);
      if (site) slots.website = /^https?:\/\//i.test(site) ? site : `https://${site}`;
      if (phone) slots.clinicPhone = phone;
      if (!site && !phone && NO_CONTACT_RE.test(text)) slots.noClinicContact = true;
      continue;
    }
    if (pending === "reason") {
      slots.reason = text.replace(/[.!]+$/, "");
      continue;
    }
    if (pending === "time" && !looksLikeClinicName(text)) {
      Object.assign(slots, splitTimeAndReason(text));
      continue;
    }

    if (bookingHasPreferredTime(text)) {
      const parsed = splitTimeAndReason(text);
      if (parsed.time) slots.time = parsed.time;
      if (parsed.reason) slots.reason = parsed.reason;
      continue;
    }
    if (looksLikeClinicName(text)) {
      slots.clinic = text.replace(/\s+/g, " ");
    }
  }
  return slots;
}

export type BookingProfile = { fullName?: string | null; phone?: string | null };

/** The one next thing to ask. Null means everything the clinic form needs is known. */
export function nextBookingQuestion(slots: BookingSlots, profile?: BookingProfile | null): string | null {
  if (!slots.clinic) {
    return "Which hospital or clinic should I book your appointment at?\n\n::suggest[Jinja Main Hospital | Jemia Doctors Chambers | Cancel booking]";
  }
  if (!slots.time && !slots.reason) return bookingClinicAckReply(slots.clinic);
  if (!slots.time) {
    return `When would you like to go to **${slots.clinic}**? Tell me the day and roughly what time.\n\n::suggest[Tomorrow morning | Tomorrow afternoon | Next Monday]`;
  }
  if (!slots.reason) {
    return "What is the visit for? A short phrase is enough, to book your appointment properly.\n\n::suggest[General checkup | Fever or malaria | Follow-up visit]";
  }
  const name = slots.patientName || profile?.fullName?.trim();
  if (!name) {
    return "Almost there. What name should the booking be under? The clinic form needs it to book your appointment.";
  }
  const phone = slots.phone || profile?.phone?.trim();
  if (!phone) {
    return `Thanks, ${name.split(/\s+/)[0]}. Which phone number can the clinic reach you on? They usually call to confirm.`;
  }
  return null;
}

export function clinicContactQuestion(clinic: string): string {
  return `I could not find an online booking page for **${clinic}**. Do you have their website or phone number for it? I will use that to try the booking.\n\n::suggest[I do not have it | Find clinics nearby | Try another clinic]`;
}

export function resolveBookingDetails(slots: BookingSlots, profile?: BookingProfile | null) {
  return {
    clinic: slots.clinic,
    time: slots.time,
    reason: slots.reason,
    patientName: slots.patientName || profile?.fullName?.trim() || undefined,
    phone: slots.phone || profile?.phone?.trim() || undefined,
    website: slots.website,
    clinicPhone: slots.clinicPhone,
    noClinicContact: Boolean(slots.noClinicContact),
  };
}
