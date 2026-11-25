/**
 * Infobip TTS voice + SMS for offline SOS GSM fallback.
 * Numbers are international digits without leading +.
 */

function runtimeEnv(name: string): string {
  const fromProcess = (process.env[name] || "").trim();
  if (fromProcess) return fromProcess;
  const cf = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  const fromCf = cf?.[name];
  return typeof fromCf === "string" ? fromCf.trim() : "";
}

export type InfobipConfig = {
  baseUrl: string;
  apiKey: string;
  sender: string | null;
};

export function getInfobipConfig(): InfobipConfig | null {
  const apiKey = runtimeEnv("INFOBIP_API_KEY");
  const baseUrl = (
    runtimeEnv("INFOBIP_BASE_URL") || "https://z4z2mx.api.infobip.com"
  ).replace(/\/$/, "");
  if (!apiKey) return null;
  const sender = runtimeEnv("INFOBIP_SENDER") || null;
  return { baseUrl, apiKey, sender };
}

export function isInfobipConfigured() {
  return getInfobipConfig() !== null;
}

export function appPublicUrl() {
  return (
    runtimeEnv("APP_PUBLIC_URL") || "https://allmasafetyai.online"
  ).replace(/\/$/, "");
}

/** Official emergency short codes — never dialed or texted. */
export function isOfficialEmergencyNumber(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (/^(999|112|911|101)$/.test(digits)) return true;
  const national = digits.replace(/^256/, "").replace(/^0/, "");
  return /^(999|112|911|101)$/.test(national);
}

/**
 * Uganda-first Infobip destination: digits only, no +.
 * 07XXXXXXXX → 2567XXXXXXXX, +2567XXXXXXXX → 2567XXXXXXXX.
 * Rejects short codes and numbers shorter than 10 digits.
 */
export function normalizeInfobipPhone(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (isOfficialEmergencyNumber(digits) || isOfficialEmergencyNumber(trimmed)) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 10 && digits[1] === "7") {
    digits = `256${digits.slice(1)}`;
  }
  // Already 2567XXXXXXXX
  if (digits.length < 10) return null;
  if (digits.startsWith("256") && digits.length === 12) return digits;
  // Other international (trial may allow verified numbers only)
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

function infobipHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `App ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export type InfobipVoiceResult = {
  success: boolean;
  httpStatus: number;
  messageId?: string;
  status?: string;
  error?: string;
  body?: string;
};

/** Text-to-speech outbound call. Speaks the alert twice; DTMF 1 repeats. */
export async function dispatchInfobipTtsCall(input: {
  to: string;
  callerName: string;
}): Promise<InfobipVoiceResult> {
  const config = getInfobipConfig();
  if (!config) {
    return { success: false, httpStatus: 0, error: "not_configured" };
  }
  const to = normalizeInfobipPhone(input.to);
  if (!to) {
    return { success: false, httpStatus: 0, error: "invalid_number" };
  }

  const who = input.callerName.trim() || "Someone";
  const once = `Emergency alert from Allma Safety AI. ${who} needs help. Check your SMS for their live location.`;
  // Speak twice (API has no dedicated "repeat twice" flag; DTMF 1 also repeats).
  const text = `${once} ${once}`;

  const message: Record<string, unknown> = {
    destinations: [{ to }],
    text,
    language: "en",
    speechRate: 1,
    repeatDtmf: "1",
  };
  if (config.sender) message.from = config.sender;

  const res = await fetch(`${config.baseUrl}/tts/3/advanced`, {
    method: "POST",
    headers: infobipHeaders(config.apiKey),
    body: JSON.stringify({ messages: [message] }),
  });
  const bodyText = await res.text();
  let messageId: string | undefined;
  let status: string | undefined;
  try {
    const json = JSON.parse(bodyText) as {
      messages?: Array<{ messageId?: string; status?: { name?: string; groupName?: string; description?: string } }>;
    };
    const row = json.messages?.[0];
    messageId = row?.messageId;
    status = row?.status?.name || row?.status?.groupName || row?.status?.description;
  } catch {
    // keep raw body
  }

  console.info("[infobip] tts", {
    httpStatus: res.status,
    toHash: to.slice(0, 5) + "…",
    messageId: messageId ?? null,
    status: status ?? null,
  });

  if (res.status < 200 || res.status >= 300) {
    console.error("[infobip] tts error body", bodyText.slice(0, 500));
    return {
      success: false,
      httpStatus: res.status,
      messageId,
      status,
      error: `infobip_tts_${res.status}`,
      body: bodyText.slice(0, 500),
    };
  }

  return { success: true, httpStatus: res.status, messageId, status, body: bodyText.slice(0, 300) };
}

export type InfobipSmsResult = {
  success: boolean;
  httpStatus: number;
  messageId?: string;
  status?: string;
  error?: string;
  body?: string;
};

export async function dispatchInfobipSms(input: {
  to: string;
  text: string;
}): Promise<InfobipSmsResult> {
  const config = getInfobipConfig();
  if (!config) {
    return { success: false, httpStatus: 0, error: "not_configured" };
  }
  const to = normalizeInfobipPhone(input.to);
  if (!to) {
    return { success: false, httpStatus: 0, error: "invalid_number" };
  }

  const message = {
    from: config.sender || "AllmaSafety",
    destinations: [{ to }],
    text: input.text.slice(0, 1000),
  };

  const res = await fetch(`${config.baseUrl}/sms/2/text/advanced`, {
    method: "POST",
    headers: infobipHeaders(config.apiKey),
    body: JSON.stringify({ messages: [message] }),
  });
  const bodyText = await res.text();
  let messageId: string | undefined;
  let status: string | undefined;
  try {
    const json = JSON.parse(bodyText) as {
      messages?: Array<{ messageId?: string; status?: { name?: string; groupName?: string } }>;
    };
    const row = json.messages?.[0];
    messageId = row?.messageId;
    status = row?.status?.name || row?.status?.groupName;
  } catch {
    // keep raw
  }

  console.info("[infobip] sms", {
    httpStatus: res.status,
    toHash: to.slice(0, 5) + "…",
    messageId: messageId ?? null,
    status: status ?? null,
  });

  if (res.status < 200 || res.status >= 300) {
    console.error("[infobip] sms error body", bodyText.slice(0, 500));
    return {
      success: false,
      httpStatus: res.status,
      messageId,
      status,
      error: `infobip_sms_${res.status}`,
      body: bodyText.slice(0, 500),
    };
  }

  return { success: true, httpStatus: res.status, messageId, status, body: bodyText.slice(0, 300) };
}
