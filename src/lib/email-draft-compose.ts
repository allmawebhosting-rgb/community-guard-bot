import { matchIncident } from "@/lib/allma-emergency-playbook";
import { isHospitalEmailDraftAsk } from "@/lib/chat-intent";
import { emailsIn, isEmailWriteAsk } from "@/lib/email-draft-intent";
import { findPlaceholders } from "@/lib/email-placeholders";
import { inUganda } from "@/lib/nearby-guard";
import { getNearestUgandaPlace, resolveUgandaPlace } from "@/lib/uganda-places";

export type EmailDraftOutput = {
  draft: true;
  sent: false;
  to: string | null;
  recipient_name: string | null;
  subject: string;
  body: string;
  /** Template leftovers still in the subject or body; the card highlights them and blocks Send. */
  placeholders: string[];
};

/** Only facts Allma actually has. A missing value stays null — it is never made up. */
export type EmailSenderContext = {
  name: string | null;
  phone: string | null;
  gmail: string | null;
  /** Town the user is in, from what they named or their shared GPS fix. */
  place: string | null;
  /** "in Jinja" / "near Jinja" */
  location: string | null;
  mapLink: string | null;
  /** The user's own words about what happened. */
  situation: string | null;
  incident: string | null;
};

const COORDS = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/;

function cleanName(value: string | null | undefined) {
  const name = (value ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || /[@\d[\]]/.test(name)) return null;
  return name;
}

function cleanSituation(text: string) {
  return text
    .replace(/my current location is:?\s*/gi, "")
    .replace(new RegExp(COORDS.source, "g"), "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?\s]+$/, "");
}

export function buildEmailSenderContext(input: {
  profile?: { full_name?: string | null; phone?: string | null; phone_e164?: string | null } | null;
  gmail?: string | null;
  /** The user's messages in this conversation, oldest first. The last one is the email ask. */
  userTexts: string[];
  coords?: { latitude: number; longitude: number } | null;
}): EmailSenderContext {
  const texts = input.userTexts.map((t) => t.trim()).filter(Boolean);
  const nonEmailTexts = texts.filter((t) => !isEmailWriteAsk(t)).reverse();

  let gps: { lat: number; lng: number } | null = null;
  const point =
    input.coords ??
    (() => {
      for (const text of [...texts].reverse()) {
        const m = COORDS.exec(text);
        if (m) return { latitude: Number(m[1]), longitude: Number(m[2]) };
      }
      return null;
    })();
  if (point && inUganda(Number(point.latitude), Number(point.longitude))) {
    gps = { lat: Number(point.latitude), lng: Number(point.longitude) };
  }

  // A town named in an email ask is usually the recipient's ("Jinja Hospital"), not where the user is.
  const named = nonEmailTexts.map((t) => resolveUgandaPlace(t)).find(Boolean) ?? null;
  const near = gps ? getNearestUgandaPlace(gps) : null;
  const place = named?.name ?? near?.name ?? null;
  const location = named ? `in ${named.name}` : near ? `near ${near.name}` : null;
  const mapLink = gps ? `https://www.google.com/maps?q=${gps.lat.toFixed(6)},${gps.lng.toFixed(6)}` : null;

  // Only messages that describe an incident or symptom count as "what happened".
  const situationText =
    nonEmailTexts
      .filter((t) => matchIncident(t.replace(new RegExp(COORDS.source, "g"), " ")))
      .map(cleanSituation)
      .find((t) => t.split(/\s+/).length >= 3) ?? null;

  const incident = matchIncident(texts.filter((t) => !isEmailWriteAsk(t)).join(" "));
  return {
    name: cleanName(input.profile?.full_name),
    phone: (input.profile?.phone_e164 || input.profile?.phone || "").trim() || null,
    gmail: input.gmail?.trim() || null,
    place,
    location,
    mapLink,
    situation: situationText,
    incident: incident?.label ?? null,
  };
}

/** The facts block given to the model. Empty lines are omitted: unknown means unknown. */
export function emailFactsBlock(ctx: EmailSenderContext): string {
  const facts = [
    ctx.name && `Sender's name: ${ctx.name}`,
    ctx.phone && `Sender's phone: ${ctx.phone}`,
    ctx.gmail && `Sender's Gmail (From address): ${ctx.gmail}`,
    ctx.location && `Sender is currently ${ctx.location}`,
    ctx.mapLink && `Sender's shared map location: ${ctx.mapLink}`,
    ctx.incident && `What the chat is about: ${ctx.incident}`,
    ctx.situation && `Sender's own words about it: "${ctx.situation}"`,
  ].filter(Boolean);
  return facts.length ? facts.join("\n") : "(nothing known about the sender yet)";
}

function topicOf(text: string) {
  const match = text.match(/\b(?:about|regarding|asking|to ask|saying|that|for)\b\s+(.{4,200})$/i);
  const topic = (match?.[1] ?? "")
    .replace(/^(about|regarding|for|to ask|that)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "");
  return topic || null;
}

const APPOINTMENT = /\b(appointment|book(ing)?|availability|schedule|slot|consultation)\b/i;

function subjectWith(base: string, name: string | null) {
  return name ? `${base} – ${name}` : base;
}

/** A complete, placeholder-free draft built only from known facts. */
export function composeEmailDraft(
  ctx: EmailSenderContext,
  input: { askText: string; to?: string | null; recipientName?: string | null },
): EmailDraftOutput {
  const to = input.to ?? emailsIn(input.askText)[0] ?? null;
  const recipient = specificRecipientName(input.recipientName);
  const hospital =
    isHospitalEmailDraftAsk(input.askText) ||
    /\b(hospital|clinic|health cent(er|re)|doctor|dispensary)\b/i.test(input.askText) ||
    Boolean(recipient);
  const appointment = APPOINTMENT.test(input.askText);
  const topic = topicOf(input.askText);

  const where = ctx.location
    ? `I am currently ${ctx.location}.`
    : ctx.mapLink
      ? "I have shared my location below."
      : null;
  const lines: string[] = [recipient ? `Dear ${recipient} team,` : "Hello,", ""];
  let subject: string;

  if (hospital && appointment) {
    subject = subjectWith("Appointment request", ctx.name);
    lines.push(ctx.name ? `My name is ${ctx.name}.` : "", "I would like to ask about appointment availability.");
  } else if (hospital) {
    subject = subjectWith("Request for medical help", ctx.name);
    lines.push(
      ctx.name ? `My name is ${ctx.name}.` : "",
      ctx.situation
        ? `I need medical help. Here is the situation: ${ctx.situation}.`
        : "I would like to ask for medical help.",
    );
  } else {
    const short = topic ? topic.charAt(0).toUpperCase() + topic.slice(1, 60) : null;
    subject = short ?? subjectWith("Message", ctx.name);
    lines.push(
      ctx.name ? `My name is ${ctx.name}.` : "",
      topic ? `I am writing about ${topic}.` : "I would like to get in touch with you.",
    );
  }
  if (where) lines.push(where);
  if (ctx.mapLink) lines.push(`My location: ${ctx.mapLink}`);
  if (ctx.phone) lines.push(`You can reach me on ${ctx.phone}.`);
  lines.push("", ctx.name ? `Thank you,\n${ctx.name}` : "Thank you.");

  const body = lines.filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n").replace(/\n{3,}/g, "\n\n");
  return {
    draft: true,
    sent: false,
    to,
    recipient_name: recipient,
    subject,
    body,
    placeholders: findPlaceholders(`${subject}\n${body}`),
  };
}

/** "nearby hospital" is not a name; only a named place or person counts. */
export function specificRecipientName(value: string | null | undefined): string | null {
  const name = (value ?? "").replace(/\s+/g, " ").trim();
  if (!name || name.length > 120) return null;
  if (/^(a|an|the|any|some)?\s*(nearby|nearest|closest|local|available|near me|good)\b/i.test(name)) return null;
  if (/^(a |an |the )?(hospital|clinic|doctor|health cent(er|re)|dispensary|pharmacy)s?( or (hospital|clinic)s?)?$/i.test(name)) return null;
  return name;
}

function replacementFor(inner: string, ctx: EmailSenderContext, recipientName: string | null): string | null {
  const key = inner.toLowerCase();
  if (/(hospital|clinic|facility|doctor|\bdr\b|recipient|receiver|organi[sz]ation|company)/.test(key)) return recipientName;
  if (/e-?mail/.test(key)) return ctx.gmail;
  if (/(phone|number|callback|call back|contact|mobile|\btel\b)/.test(key)) return ctx.phone;
  if (/(location|address|town|area|place|where|district|city)/.test(key)) return ctx.place ?? ctx.mapLink;
  if (/(symptom|injur|problem|condition|situation|issue|reason|what happened|details)/.test(key)) return ctx.situation;
  if (/(name|patient|sender|user|signature)/.test(key)) return ctx.name;
  return null;
}

function fillKnown(text: string, ctx: EmailSenderContext, recipientName: string | null) {
  return text.replace(/\[([^\[\]\n]*[A-Za-z][^\[\]\n]*)\]/g, (whole, inner: string) => replacementFor(inner, ctx, recipientName) ?? whole);
}

function dropUnknown(body: string): string {
  const out: string[] = [];
  let droppedSignature = false;
  const lines = body.split("\n");
  lines.forEach((line, index) => {
    if (findPlaceholders(line).length === 0) {
      out.push(line);
      return;
    }
    if (/^\s*(dear|hello|hi)\b/i.test(line)) {
      out.push("Hello,");
      return;
    }
    const previous = [...lines.slice(0, index)].reverse().find((l) => l.trim()) ?? "";
    if (line.trim().length <= 40 && /^(sincerely|regards|kind regards|best regards|best wishes|thank you|thanks|yours)/i.test(previous.trim())) {
      droppedSignature = true;
      return;
    }
    const kept = line
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => findPlaceholders(sentence).length === 0)
      .join(" ")
      .trim();
    if (kept) out.push(kept);
  });
  const text = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!droppedSignature) return text;
  return text.replace(/\n[ \t]*(sincerely|regards|kind regards|best regards|best wishes|thank you|thanks|yours[a-z ]*),?\s*$/i, "\nThank you.");
}

/**
 * Takes the model's draft, fills the details Allma knows, and removes template leftovers
 * ("leave it out" rather than "[Symptoms]"). If nothing usable is left it falls back to the
 * deterministic draft. The card still flags and blocks anything bracketed that remains.
 */
export function finalizeModelDraft(
  model: { to?: string | null; recipient_name?: string | null; subject?: string | null; body?: string | null },
  ctx: EmailSenderContext,
  input: { askText: string; to: string | null },
): EmailDraftOutput {
  const recipientName = specificRecipientName(model.recipient_name);
  const fallback = composeEmailDraft(ctx, { askText: input.askText, to: input.to, recipientName });

  let subject = fillKnown(model.subject ?? "", ctx, recipientName).replace(/\s+/g, " ").trim();
  if (!subject || subject.length > 80 || findPlaceholders(subject).length > 0) subject = fallback.subject;

  let body = dropUnknown(fillKnown((model.body ?? "").replace(/\r\n/g, "\n"), ctx, recipientName).trim());
  if (body.length < 30) body = fallback.body;

  return {
    draft: true,
    sent: false,
    to: input.to,
    recipient_name: recipientName,
    subject,
    body,
    placeholders: findPlaceholders(`${subject}\n${body}`),
  };
}
