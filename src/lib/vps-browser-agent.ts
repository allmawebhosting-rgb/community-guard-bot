/**
 * Client for the Allma VPS browser booking agent.
 * Never logs or returns vault passwords.
 */

export type BookAppointmentInput = {
  hospital_name: string;
  preferred_time: string;
  reason_for_visit: string;
  patient_name?: string;
  phone_number?: string;
};

export type BookAppointmentResult = {
  status: string;
  hospital: string;
  summary: string;
  screenshot_url?: string | null;
  success: boolean;
  payment_required?: boolean;
  patient_name?: string;
  preferred_time?: string;
  reason_for_visit?: string;
  error?: string;
  job_id?: string;
  async?: boolean;
  ok?: boolean;
};

function runtimeEnv(name: string): string {
  const fromProcess = (process.env[name] || "").trim();
  if (fromProcess) return fromProcess;
  // Cloudflare Workers secrets are on the fetch env binding (set on globalThis.__env__).
  const cf = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  const fromCf = cf?.[name];
  return typeof fromCf === "string" ? fromCf.trim() : "";
}

function agentBaseUrl() {
  return runtimeEnv("VPS_AGENT_BASE_URL").replace(/\/$/, "");
}

function agentToken() {
  return runtimeEnv("VPS_AGENT_SECRET_TOKEN");
}

export function isBrowserAgentConfigured() {
  return Boolean(agentBaseUrl() && agentToken());
}

/** Absolute screenshot URL for the chat card (VPS public base + relative path). */
export function absoluteScreenshotUrl(screenshotPath: string | null | undefined) {
  if (!screenshotPath) return null;
  if (/^https?:\/\//i.test(screenshotPath)) return screenshotPath;
  const base = agentBaseUrl();
  if (!base) return null;
  return `${base}${screenshotPath.startsWith("/") ? "" : "/"}${screenshotPath}`;
}

async function readAgentResponse(res: Response): Promise<{
  data: BookAppointmentResult | null;
  rawText: string;
}> {
  const rawText = await res.text();
  try {
    return { data: JSON.parse(rawText) as BookAppointmentResult, rawText };
  } catch {
    return { data: null, rawText };
  }
}

function failedResult(
  hospital: string,
  summary: string,
  extra?: Partial<BookAppointmentResult>,
): BookAppointmentResult {
  return {
    status: "failed",
    hospital,
    summary,
    screenshot_url: null,
    success: false,
    payment_required: false,
    ...extra,
  };
}

const POLL_MS = 4_000;
const MAX_WAIT_MS = 8 * 60 * 1000;

/**
 * Start an async booking job on the VPS agent and poll until it finishes.
 * Avoids Cloudflare 524 / Worker timeouts from holding one long Playwright request.
 */
export async function bookHospitalAppointment(
  input: BookAppointmentInput,
): Promise<BookAppointmentResult> {
  const base = agentBaseUrl();
  const token = agentToken();
  if (!base || !token) {
    return failedResult(
      input.hospital_name,
      "Appointment booking agent is not configured. Set VPS_AGENT_BASE_URL and VPS_AGENT_SECRET_TOKEN.",
    );
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  try {
    const startRes = await fetch(`${base}/api/tasks/book-appointment`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        hospital_name: input.hospital_name,
        preferred_time: input.preferred_time,
        reason_for_visit: input.reason_for_visit,
        patient_name: input.patient_name,
        phone_number: input.phone_number,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const { data: startData, rawText: startRaw } = await readAgentResponse(startRes);
    if (!startRes.ok || !startData) {
      const hint = startRaw.replace(/\s+/g, " ").trim().slice(0, 160);
      return failedResult(
        input.hospital_name,
        `Booking agent returned HTTP ${startRes.status}${hint ? ` (${hint})` : ""}. If this is urgent, call Ambulance 911, Toll-free 112, or Police 999.`,
      );
    }

    // Legacy sync response (no job_id) — already finished.
    if (!startData.job_id || startData.status === "completed" || startData.success) {
      return {
        ...startData,
        screenshot_url:
          absoluteScreenshotUrl(startData.screenshot_url) ?? startData.screenshot_url ?? null,
      };
    }

    const jobId = startData.job_id;
    const deadline = Date.now() + MAX_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const pollRes = await fetch(`${base}/api/tasks/book-appointment/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      });
      const { data: pollData, rawText: pollRaw } = await readAgentResponse(pollRes);
      if (!pollRes.ok || !pollData) {
        const hint = pollRaw.replace(/\s+/g, " ").trim().slice(0, 160);
        return failedResult(
          input.hospital_name,
          `Booking poll returned HTTP ${pollRes.status}${hint ? ` (${hint})` : ""}.`,
          { job_id: jobId },
        );
      }
      if (pollData.status === "queued" || pollData.status === "running") {
        continue;
      }
      return {
        ...pollData,
        job_id: jobId,
        screenshot_url:
          absoluteScreenshotUrl(pollData.screenshot_url) ?? pollData.screenshot_url ?? null,
      };
    }

    return failedResult(
      input.hospital_name,
      "Booking is still running on the agent but timed out waiting for a result. Try again in a minute, or call Ambulance 911 / Toll-free 112 if urgent.",
      { job_id: jobId, status: "running" },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "network error";
    return failedResult(
      input.hospital_name,
      `Could not reach the booking agent (${message}). If urgent, call Ambulance 911, Toll-free 112, or Police 999.`,
      { error: message },
    );
  }
}
