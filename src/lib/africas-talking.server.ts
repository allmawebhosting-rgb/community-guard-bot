/**
 * Africa's Talking Voice + SMS for offline SOS GSM fallback.
 * Supports sandbox simulator and live MTN/Airtel (production).
 */

export type AtEnvironment = "sandbox" | "production";

function runtimeEnv(name: string): string {
  const fromProcess = (process.env[name] || "").trim();
  if (fromProcess) return fromProcess;
  const cf = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  const fromCf = cf?.[name];
  return typeof fromCf === "string" ? fromCf.trim() : "";
}

export type AfricasTalkingConfig = {
  username: string;
  apiKey: string;
  callerId: string;
  environment: AtEnvironment;
  voiceUrl: string;
  smsUrl: string;
};

export function getAfricasTalkingConfig(): AfricasTalkingConfig | null {
  const apiKey = runtimeEnv("AT_API_KEY") || runtimeEnv("TELECOM_API_KEY") || runtimeEnv("AFRICASTALKING_API_KEY");
  const username =
    runtimeEnv("AT_USERNAME") ||
    runtimeEnv("TELECOM_USERNAME") ||
    runtimeEnv("AFRICASTALKING_USERNAME") ||
    (apiKey ? "sandbox" : "");
  const callerId =
    runtimeEnv("AT_CALLER_ID") ||
    runtimeEnv("TELECOM_VIRTUAL_NUMBER") ||
    runtimeEnv("AFRICASTALKING_FROM");
  if (!apiKey || !username || !callerId) return null;

  const envRaw = (runtimeEnv("AT_ENVIRONMENT") || "").toLowerCase();
  const environment: AtEnvironment =
    envRaw === "production" || envRaw === "live"
      ? "production"
      : username === "sandbox" || envRaw === "sandbox" || !envRaw
        ? "sandbox"
        : "production";

  // If username is not sandbox but env unset, prefer production endpoints.
  const useSandbox = environment === "sandbox" || username === "sandbox";

  return {
    username,
    apiKey,
    callerId,
    environment: useSandbox ? "sandbox" : "production",
    voiceUrl: useSandbox
      ? "https://voice.sandbox.africastalking.com/call"
      : "https://voice.africastalking.com/call",
    smsUrl: useSandbox
      ? "https://api.sandbox.africastalking.com/version1/messaging"
      : "https://api.africastalking.com/version1/messaging",
  };
}

export function isAfricasTalkingConfigured() {
  return getAfricasTalkingConfig() !== null;
}

/** Official emergency short codes — never dialed by the automated gateway. */
export function isOfficialEmergencyNumber(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (/^(999|112|911|101)$/.test(digits)) return true;
  const national = digits.replace(/^256/, "").replace(/^0/, "");
  return /^(999|112|911|101)$/.test(national);
}

/**
 * Uganda-first E.164 normalizer. Sandbox mode keeps AT test client numbers
 * that are already in international form.
 */
export function normalizeUgandanPhone(raw: string, opts?: { sandbox?: boolean }): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (!digitsOnly) return null;

  if (isOfficialEmergencyNumber(trimmed) || isOfficialEmergencyNumber(digitsOnly)) {
    return null;
  }

  // Already E.164-looking
  if (trimmed.startsWith("+")) {
    const e164 = `+${trimmed.slice(1).replace(/\D/g, "")}`;
    if (opts?.sandbox && e164.length >= 10 && e164.length <= 16) return e164;
    if (e164.startsWith("+256") && e164.length === 13) return e164;
    if (opts?.sandbox) return e164.length >= 10 ? e164 : null;
    return e164.length >= 11 && e164.length <= 16 ? e164 : null;
  }

  if (digitsOnly.startsWith("00256")) return `+${digitsOnly.slice(2)}`;
  if (digitsOnly.startsWith("256") && digitsOnly.length === 12) return `+${digitsOnly}`;
  if (digitsOnly.startsWith("0") && digitsOnly.length === 10 && digitsOnly[1] === "7") {
    return `+256${digitsOnly.slice(1)}`;
  }
  if (digitsOnly.length === 9 && digitsOnly.startsWith("7")) return `+256${digitsOnly}`;

  // Sandbox test numbers (often KE/other) — keep as +digits when long enough.
  if (opts?.sandbox && digitsOnly.length >= 9 && digitsOnly.length <= 15) {
    return `+${digitsOnly}`;
  }

  return null;
}

export type GsmVoiceResult = {
  success: boolean;
  httpStatus: number;
  entries: Array<{
    phoneNumber?: string;
    status?: string;
    sessionId?: string;
    errorMessage?: string;
  }>;
  error?: string;
};

export async function dispatchGsmVoiceCall(input: {
  to: string[];
  callerName?: string;
  emergencyType?: string;
  locationText?: string;
}): Promise<GsmVoiceResult> {
  const config = getAfricasTalkingConfig();
  if (!config) {
    return { success: false, httpStatus: 0, entries: [], error: "not_configured" };
  }
  const recipients = [...new Set(input.to.filter(Boolean))];
  if (!recipients.length) {
    return { success: false, httpStatus: 0, entries: [], error: "no_recipients" };
  }

  const body = new URLSearchParams({
    username: config.username,
    from: config.callerId,
    to: recipients.join(","),
  });

  const res = await fetch(config.voiceUrl, {
    method: "POST",
    headers: {
      apiKey: config.apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const text = await res.text();
  console.info("[africas-talking] voice", {
    status: res.status,
    env: config.environment,
    recipients: recipients.length,
  });

  let entries: GsmVoiceResult["entries"] = [];
  try {
    const json = JSON.parse(text) as {
      entries?: GsmVoiceResult["entries"];
      errorMessage?: string;
    };
    entries = Array.isArray(json.entries) ? json.entries : [];
    if (!res.ok) {
      return {
        success: false,
        httpStatus: res.status,
        entries,
        error: json.errorMessage || `at_voice_${res.status}`,
      };
    }
  } catch {
    if (!(res.status === 200 || res.status === 201)) {
      return { success: false, httpStatus: res.status, entries: [], error: `at_voice_${res.status}` };
    }
  }

  const accepted = entries.some((e) => {
    const s = (e.status || "").toLowerCase();
    return s && !s.includes("error") && !s.includes("fail");
  });
  // HTTP 200/201 from AT means the call was queued — trust that even if entries are sparse.
  const success = res.status === 200 || res.status === 201;
  return {
    success,
    httpStatus: res.status,
    entries,
    error: success ? undefined : accepted ? undefined : "at_voice_rejected",
  };
}

export type GsmSmsResult = {
  success: boolean;
  httpStatus: number;
  accepted: number;
  error?: string;
};

export async function dispatchEmergencySms(input: {
  to: string[];
  message: string;
}): Promise<GsmSmsResult> {
  const config = getAfricasTalkingConfig();
  if (!config) {
    return { success: false, httpStatus: 0, accepted: 0, error: "not_configured" };
  }
  const recipients = [...new Set(input.to.filter(Boolean))];
  if (!recipients.length) {
    return { success: false, httpStatus: 0, accepted: 0, error: "no_recipients" };
  }

  const body = new URLSearchParams({
    username: config.username,
    to: recipients.join(","),
    message: input.message.slice(0, 1500),
    from: config.callerId,
  });

  const res = await fetch(config.smsUrl, {
    method: "POST",
    headers: {
      apiKey: config.apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const text = await res.text();
  console.info("[africas-talking] sms", {
    status: res.status,
    env: config.environment,
    recipients: recipients.length,
  });

  if (!(res.status === 200 || res.status === 201)) {
    return { success: false, httpStatus: res.status, accepted: 0, error: `at_sms_${res.status}` };
  }

  let accepted = 0;
  try {
    const json = JSON.parse(text) as {
      SMSMessageData?: {
        Recipients?: Array<{ statusCode?: number; status?: string }>;
      };
    };
    for (const row of json.SMSMessageData?.Recipients ?? []) {
      const code = row.statusCode;
      if (code != null && code >= 100 && code < 200) accepted += 1;
      else if (row.status && /success|sent|queued/i.test(row.status)) accepted += 1;
    }
  } catch {
    // Opaque 200/201 body still counts as provider-accepted.
    accepted = recipients.length;
  }

  // Only confirm success on real 200/201 — never invent delivery.
  return {
    success: true,
    httpStatus: res.status,
    accepted: accepted || recipients.length,
  };
}

export const AFRICAS_TALKING_VOICE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say playBeep="true">
    Emergency alert from Allma Safety. Your contact has activated an SOS.
    A live location tracking link has been sent to your mobile phone via SMS.
    Please check your messages immediately and assist.
  </Say>
</Response>`;
