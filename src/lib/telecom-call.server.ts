/**
 * Server-side GSM voice + SMS fallback via Africa's Talking or Twilio.
 * Never auto-dials official emergency short codes (999 / 112 / 911).
 */
import { createHash, createHmac } from "node:crypto";
import { isLikelyValidPhone, normalizePhone } from "@/lib/phone";

export type TelecomProvider = "africas_talking" | "twilio";

export type TelecomEscalationInput = {
  activityId: string;
  userId: string;
  callerName: string;
  emergencyType: string;
  locationText: string;
  coordinates?: { lat: number; lng: number } | null;
};

export type TelecomContact = {
  name: string;
  phone: string;
};

export type TelecomDispatchResult = {
  ok: boolean;
  status:
    | "queued"
    | "dialing"
    | "completed"
    | "partial"
    | "failed"
    | "skipped_duplicate"
    | "not_configured"
    | "no_contacts";
  provider: TelecomProvider | null;
  contactsTargeted: number;
  callsQueued: number;
  smsQueued: number;
  message: string;
  escalationId?: string;
};

const APP_ORIGIN = () =>
  (
    process.env.APP_PUBLIC_URL ||
    process.env.PUBLIC_APP_URL ||
    "https://allmasafetyai.online"
  )
    .trim()
    .replace(/\/$/, "");

function runtimeEnv(name: string): string {
  const fromProcess = (process.env[name] || "").trim();
  if (fromProcess) return fromProcess;
  const cf = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  const fromCf = cf?.[name];
  return typeof fromCf === "string" ? fromCf.trim() : "";
}

/** Official emergency / short codes — never dialed by the automated gateway. */
export function isOfficialEmergencyNumber(raw: string): boolean {
  const normalized = normalizePhone(raw);
  if (!normalized) {
    const digits = raw.replace(/\D/g, "");
    return /^(999|112|911|101)$/.test(digits);
  }
  const digits = normalized.replace(/\D/g, "");
  if (/^(999|112|911|101)$/.test(digits)) return true;
  // Strip Uganda country code and leading 0.
  const national = digits.replace(/^256/, "").replace(/^0/, "");
  return /^(999|112|911|101)$/.test(national);
}

export function hashPhone(e164: string): string {
  return createHash("sha256").update(e164).digest("hex").slice(0, 32);
}

export function voiceScriptToken(activityId: string): string {
  const secret =
    runtimeEnv("TELECOM_CALLBACK_SECRET") ||
    runtimeEnv("TELECOM_API_KEY") ||
    runtimeEnv("TWILIO_AUTH_TOKEN") ||
    "allma-telecom-dev";
  return createHmac("sha256", secret).update(`voice-script:${activityId}`).digest("hex").slice(0, 24);
}

export function verifyVoiceScriptToken(activityId: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = voiceScriptToken(activityId);
  if (expected.length !== token.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return mismatch === 0;
}

export function buildVoiceScriptText(input: {
  callerName: string;
  emergencyType: string;
  locationText: string;
}): string {
  const who = input.callerName.trim() || "an Allma user";
  const kind = input.emergencyType.trim() || "an emergency";
  const where = input.locationText.trim() || "an unknown location";
  return `Emergency alert from ${who}. They triggered an SOS for ${kind} near ${where}. Press 1 to confirm, or check your SMS for live location.`;
}

export function buildEmergencySms(input: {
  callerName: string;
  emergencyType: string;
  locationText: string;
  activityId: string;
}): string {
  const who = input.callerName.trim() || "Someone";
  const kind = input.emergencyType.trim() || "emergency";
  const where = input.locationText.trim() || "their last shared area";
  const link = `${APP_ORIGIN()}/sos?id=${encodeURIComponent(input.activityId)}`;
  return `EMERGENCY: ${who} activated an SOS (${kind}) near ${where}. Track live & join emergency room: ${link}`;
}

export type ResolvedTelecomConfig =
  | {
      provider: "africas_talking";
      apiKey: string;
      username: string;
      from: string;
    }
  | {
      provider: "twilio";
      accountSid: string;
      authToken: string;
      from: string;
    }
  | null;

export function resolveTelecomConfig(): ResolvedTelecomConfig {
  const atKey = runtimeEnv("TELECOM_API_KEY") || runtimeEnv("AFRICASTALKING_API_KEY");
  const atUser = runtimeEnv("TELECOM_USERNAME") || runtimeEnv("AFRICASTALKING_USERNAME");
  const virtual =
    runtimeEnv("TELECOM_VIRTUAL_NUMBER") ||
    runtimeEnv("AFRICASTALKING_FROM") ||
    runtimeEnv("TWILIO_FROM_NUMBER");

  if (atKey && atUser && virtual) {
    return { provider: "africas_talking", apiKey: atKey, username: atUser, from: virtual };
  }

  const sid = runtimeEnv("TWILIO_ACCOUNT_SID");
  const token = runtimeEnv("TWILIO_AUTH_TOKEN");
  const from = virtual || runtimeEnv("TWILIO_FROM_NUMBER");
  if (sid && token && from) {
    return { provider: "twilio", accountSid: sid, authToken: token, from };
  }
  return null;
}

export function isTelecomConfigured() {
  return resolveTelecomConfig() !== null;
}

export function sanitizeDialList(contacts: TelecomContact[]): Array<TelecomContact & { e164: string }> {
  const seen = new Set<string>();
  const out: Array<TelecomContact & { e164: string }> = [];
  for (const contact of contacts) {
    const e164 = normalizePhone(contact.phone);
    if (!e164 || !isLikelyValidPhone(e164)) continue;
    if (isOfficialEmergencyNumber(e164)) continue;
    if (seen.has(e164)) continue;
    seen.add(e164);
    out.push({
      name: (contact.name || "Emergency contact").trim().slice(0, 80) || "Emergency contact",
      phone: contact.phone,
      e164,
    });
  }
  return out;
}

async function placeAfricasTalkingCall(
  config: Extract<ResolvedTelecomConfig, { provider: "africas_talking" }>,
  to: string,
): Promise<{ ok: boolean; ref?: string; error?: string }> {
  const body = new URLSearchParams({
    username: config.username,
    from: config.from,
    to,
  });
  const res = await fetch("https://voice.africastalking.com/call", {
    method: "POST",
    headers: {
      apiKey: config.apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: `at_voice_${res.status}` };
  }
  try {
    const json = JSON.parse(text) as {
      entries?: Array<{ status?: string; phoneNumber?: string; sessionId?: string }>;
      errorMessage?: string;
    };
    const entry = json.entries?.[0];
    const status = (entry?.status || "").toLowerCase();
    if (status.includes("error") || status.includes("fail")) {
      return { ok: false, error: status || "at_voice_rejected", ref: entry?.sessionId };
    }
    return { ok: true, ref: entry?.sessionId || undefined };
  } catch {
    // Some AT responses are 201 with opaque body — treat HTTP success as queued.
    return res.status < 300 ? { ok: true } : { ok: false, error: "at_voice_parse" };
  }
}

async function sendAfricasTalkingSms(
  config: Extract<ResolvedTelecomConfig, { provider: "africas_talking" }>,
  to: string,
  message: string,
): Promise<{ ok: boolean; ref?: string; error?: string }> {
  const body = new URLSearchParams({
    username: config.username,
    to,
    message,
    from: config.from,
  });
  const res = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: {
      apiKey: config.apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, error: `at_sms_${res.status}` };
  try {
    const json = JSON.parse(text) as {
      SMSMessageData?: {
        Recipients?: Array<{ statusCode?: number; messageId?: string; status?: string }>;
      };
    };
    const recipient = json.SMSMessageData?.Recipients?.[0];
    const code = recipient?.statusCode;
    // AT: 100 / 101 / 102 = accepted/queued
    if (code != null && code >= 100 && code < 200) {
      return { ok: true, ref: recipient?.messageId };
    }
    if (recipient?.status && /success|sent|queued/i.test(recipient.status)) {
      return { ok: true, ref: recipient.messageId };
    }
    return { ok: res.status < 300, ref: recipient?.messageId, error: recipient?.status };
  } catch {
    return res.status < 300 ? { ok: true } : { ok: false, error: "at_sms_parse" };
  }
}

async function placeTwilioCall(
  config: Extract<ResolvedTelecomConfig, { provider: "twilio" }>,
  to: string,
  scriptUrl: string,
): Promise<{ ok: boolean; ref?: string; error?: string }> {
  const auth = btoa(`${config.accountSid}:${config.authToken}`);
  const body = new URLSearchParams({
    To: to,
    From: config.from,
    Url: scriptUrl,
    Method: "POST",
  });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  const text = await res.text();
  if (!(res.status === 200 || res.status === 201)) {
    return { ok: false, error: `twilio_voice_${res.status}` };
  }
  try {
    const json = JSON.parse(text) as { sid?: string };
    return { ok: true, ref: json.sid };
  } catch {
    return { ok: true };
  }
}

async function sendTwilioSms(
  config: Extract<ResolvedTelecomConfig, { provider: "twilio" }>,
  to: string,
  message: string,
): Promise<{ ok: boolean; ref?: string; error?: string }> {
  const auth = btoa(`${config.accountSid}:${config.authToken}`);
  const body = new URLSearchParams({
    To: to,
    From: config.from,
    Body: message.slice(0, 1500),
  });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  if (!(res.status === 200 || res.status === 201)) {
    return { ok: false, error: `twilio_sms_${res.status}` };
  }
  try {
    const json = (await res.json()) as { sid?: string };
    return { ok: true, ref: json.sid };
  } catch {
    return { ok: true };
  }
}

export function renderVoiceScriptXml(
  provider: "africas_talking" | "twilio",
  sayText: string,
): string {
  const safe = sayText.replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[ch]!);
  if (provider === "twilio") {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">${safe}</Say><Pause length="1"/><Say>Goodbye.</Say><Hangup/></Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="en-UK">${safe}</Say><Say>Goodbye.</Say></Response>`;
}

/**
 * Places outbound voice calls + SMS for offline emergency contacts.
 * Caller must enforce ownership / idempotency at the session layer.
 */
export async function dispatchOfflineEmergencyVoiceAndSms(
  input: TelecomEscalationInput & {
    contacts: TelecomContact[];
    scriptBaseUrl?: string;
  },
): Promise<
  TelecomDispatchResult & {
    contactResults: Array<{
      name: string;
      phoneHash: string;
      channel: "voice" | "sms";
      stage: string;
      providerRef?: string;
      errorCode?: string;
    }>;
  }
> {
  const config = resolveTelecomConfig();
  if (!config) {
    return {
      ok: false,
      status: "not_configured",
      provider: null,
      contactsTargeted: 0,
      callsQueued: 0,
      smsQueued: 0,
      message: "GSM voice & SMS gateway is not configured.",
      contactResults: [],
    };
  }

  const dialList = sanitizeDialList(input.contacts);
  if (!dialList.length) {
    return {
      ok: false,
      status: "no_contacts",
      provider: config.provider,
      contactsTargeted: 0,
      callsQueued: 0,
      smsQueued: 0,
      message: "No dialable emergency contact phone numbers on file.",
      contactResults: [],
    };
  }

  const smsBody = buildEmergencySms({
    callerName: input.callerName,
    emergencyType: input.emergencyType,
    locationText: input.locationText,
    activityId: input.activityId,
  });
  const token = voiceScriptToken(input.activityId);
  const origin = (input.scriptBaseUrl || APP_ORIGIN()).replace(/\/$/, "");
  const scriptUrl = `${origin}/api/telecom/voice-script?activityId=${encodeURIComponent(input.activityId)}&token=${encodeURIComponent(token)}&provider=${config.provider}`;

  let callsQueued = 0;
  let smsQueued = 0;
  const contactResults: Array<{
    name: string;
    phoneHash: string;
    channel: "voice" | "sms";
    stage: string;
    providerRef?: string;
    errorCode?: string;
  }> = [];

  await Promise.all(
    dialList.map(async (contact) => {
      const phoneHash = hashPhone(contact.e164);

      const voice =
        config.provider === "africas_talking"
          ? await placeAfricasTalkingCall(config, contact.e164)
          : await placeTwilioCall(config, contact.e164, scriptUrl);
      if (voice.ok) {
        callsQueued += 1;
        contactResults.push({
          name: contact.name,
          phoneHash,
          channel: "voice",
          stage: "provider_accepted",
          providerRef: voice.ref,
        });
      } else {
        contactResults.push({
          name: contact.name,
          phoneHash,
          channel: "voice",
          stage: "provider_rejected",
          errorCode: voice.error,
        });
      }

      const sms =
        config.provider === "africas_talking"
          ? await sendAfricasTalkingSms(config, contact.e164, smsBody)
          : await sendTwilioSms(config, contact.e164, smsBody);
      if (sms.ok) {
        smsQueued += 1;
        contactResults.push({
          name: contact.name,
          phoneHash,
          channel: "sms",
          stage: "provider_accepted",
          providerRef: sms.ref,
        });
      } else {
        contactResults.push({
          name: contact.name,
          phoneHash,
          channel: "sms",
          stage: "provider_rejected",
          errorCode: sms.error,
        });
      }
    }),
  );

  const anyOk = callsQueued > 0 || smsQueued > 0;
  const allOk = callsQueued === dialList.length && smsQueued === dialList.length;
  const status = allOk ? "completed" : anyOk ? "partial" : "failed";

  return {
    ok: anyOk,
    status,
    provider: config.provider,
    contactsTargeted: dialList.length,
    callsQueued,
    smsQueued,
    message: anyOk
      ? `Alerted ${dialList.length} emergency contact${dialList.length === 1 ? "" : "s"} via direct mobile call & SMS.`
      : "Telecom gateway rejected the emergency call and SMS attempts.",
    contactResults,
  };
}
