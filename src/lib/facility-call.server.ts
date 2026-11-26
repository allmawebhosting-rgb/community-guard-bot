/**
 * Voice call to a health facility's business number through the existing Infobip account.
 * Uses the same configuration, credentials and TTS endpoint as the SOS voice path; it only
 * sends its own message text and reads back the delivery status. Short emergency codes
 * (999, 112, 911, 101) are refused before any request is made.
 */
import { getInfobipConfig, isOfficialEmergencyNumber, normalizeInfobipPhone } from "@/lib/infobip.server";

export type FacilityCallOutcome =
  | { status: "answered"; messageId: string | null; detail: string }
  | { status: "no_answer"; messageId: string | null; detail: string }
  | { status: "failed"; messageId: string | null; detail: string }
  | { status: "skipped"; messageId: null; detail: string };

type InfobipStatus = { groupName?: string; name?: string; description?: string };

/** Maps an Infobip delivery status to what the user sees. Null means still in progress. */
export function interpretCallStatus(status: InfobipStatus | undefined): "answered" | "no_answer" | "failed" | null {
  const group = (status?.groupName ?? "").toUpperCase();
  const name = (status?.name ?? "").toUpperCase();
  if (group === "DELIVERED") return "answered";
  if (group === "PENDING" || group === "") return null;
  if (/NO_ANSWER|NOT_ANSWER|BUSY|UNREACHABLE|EXPIRED|NO_RESPONSE|TIMEOUT|REJECTED_BY_USER|DECLINED/.test(name)) return "no_answer";
  if (["EXPIRED"].includes(group)) return "no_answer";
  return "failed";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function callFacility(input: {
  to: string;
  text: string;
  /** Longest wait for an answer before reporting "no answer". */
  waitMs?: number;
  pollEveryMs?: number;
}): Promise<FacilityCallOutcome> {
  const config = getInfobipConfig();
  if (!config) return { status: "skipped", messageId: null, detail: "Calling is not set up" };
  if (isOfficialEmergencyNumber(input.to)) {
    return { status: "skipped", messageId: null, detail: "Official emergency numbers are never dialed" };
  }
  const to = normalizeInfobipPhone(input.to);
  if (!to) return { status: "failed", messageId: null, detail: "Not a callable number" };

  const headers = {
    Authorization: `App ${config.apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const message: Record<string, unknown> = {
    destinations: [{ to }],
    text: input.text.slice(0, 1200),
    language: "en",
    speechRate: 1,
  };
  if (config.sender) message.from = config.sender;

  let messageId: string | null = null;
  try {
    const res = await fetch(`${config.baseUrl}/tts/3/advanced`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: [message] }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ messageId?: string; status?: InfobipStatus }>;
    };
    if (!res.ok) {
      console.error("[facility-call] infobip rejected", res.status);
      return { status: "failed", messageId: null, detail: `Call provider error ${res.status}` };
    }
    messageId = body.messages?.[0]?.messageId ?? null;
    const immediate = interpretCallStatus(body.messages?.[0]?.status);
    if (immediate === "failed") return { status: "failed", messageId, detail: "Call could not be placed" };
  } catch {
    return { status: "failed", messageId: null, detail: "Call provider unreachable" };
  }
  if (!messageId) return { status: "failed", messageId: null, detail: "Call was not accepted" };

  const deadline = Date.now() + (input.waitMs ?? 25_000);
  const every = input.pollEveryMs ?? 3_000;
  while (Date.now() < deadline) {
    await sleep(every);
    try {
      const res = await fetch(`${config.baseUrl}/tts/3/logs?messageId=${encodeURIComponent(messageId)}`, { headers });
      if (!res.ok) continue;
      const json = (await res.json()) as { results?: Array<{ status?: InfobipStatus }> };
      const outcome = interpretCallStatus(json.results?.[0]?.status);
      if (outcome === "answered") return { status: "answered", messageId, detail: "Answered" };
      if (outcome === "no_answer") return { status: "no_answer", messageId, detail: "No answer" };
      if (outcome === "failed") return { status: "failed", messageId, detail: "Call failed" };
    } catch {
      // Keep waiting until the deadline.
    }
  }
  return { status: "no_answer", messageId, detail: "No answer" };
}
