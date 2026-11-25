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
  /** Official clinic website — never a search engine URL. */
  portal_url?: string;
  /** Clinic phone for voice booking when online booking is blocked. */
  clinic_phone?: string;
};

export type BookingProcessStep = {
  label: string;
  screenshot_url?: string | null;
  status?: string;
};

export type BookAppointmentResult = {
  status: string;
  hospital: string;
  summary: string;
  screenshot_url?: string | null;
  screenshots?: string[];
  steps?: BookingProcessStep[];
  success: boolean;
  payment_required?: boolean;
  patient_name?: string;
  preferred_time?: string;
  reason_for_visit?: string;
  clinic_phone?: string | null;
  error?: string;
  job_id?: string;
  async?: boolean;
  ok?: boolean;
};

export type BookingProgressUpdate = {
  status: string;
  summary: string;
  steps: BookingProcessStep[];
  screenshots: string[];
  screenshot_url?: string | null;
  hospital?: string;
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

/**
 * Turn a VPS-relative screenshot path into a URL the HTTPS chat UI can load.
 * Raw http://IP hostnames are blocked by browsers (mixed content) and by
 * Cloudflare Workers (error 1003), so we proxy through same-origin HTTPS.
 */
export function absoluteScreenshotUrl(screenshotPath: string | null | undefined) {
  if (!screenshotPath) return null;
  if (/^https:\/\//i.test(screenshotPath)) return screenshotPath;
  let path = screenshotPath;
  if (/^http:\/\//i.test(path)) {
    try {
      const u = new URL(path);
      path = u.pathname + u.search;
    } catch {
      return null;
    }
  }
  if (!path.startsWith("/")) path = `/${path}`;
  // Same-origin Worker proxy (auth happens server-side with VPS token).
  return `/api/browser-agent-media?path=${encodeURIComponent(path)}`;
}

function rewriteResultUrls<T extends BookAppointmentResult>(data: T): T {
  const screenshot_url = absoluteScreenshotUrl(data.screenshot_url) ?? null;
  const screenshots = (data.screenshots ?? [])
    .map((s) => absoluteScreenshotUrl(s))
    .filter((s): s is string => Boolean(s));
  const steps = (data.steps ?? []).map((step) => ({
    ...step,
    screenshot_url: absoluteScreenshotUrl(step.screenshot_url) ?? null,
  }));
  return { ...data, screenshot_url, screenshots, steps };
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
    screenshots: [],
    steps: [],
    success: false,
    payment_required: false,
    ...extra,
  };
}

const POLL_MS = 3_500;
const MAX_WAIT_MS = 8 * 60 * 1000;

/**
 * Start an async booking job on the VPS agent and poll until it finishes.
 * Avoids Cloudflare 524 / Worker timeouts from holding one long Playwright request.
 */
export async function bookHospitalAppointment(
  input: BookAppointmentInput & {
    onProgress?: (update: BookingProgressUpdate) => void;
  },
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
        portal_url: input.portal_url,
        clinic_phone: input.clinic_phone,
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
      return rewriteResultUrls(startData);
    }

    const jobId = startData.job_id;
    input.onProgress?.({
      status: "queued",
      summary: "Booking job started…",
      steps: [{ label: "Booking job started…", status: "queued" }],
      screenshots: [],
      hospital: input.hospital_name,
    });

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

      const rewritten = rewriteResultUrls(pollData);
      if (pollData.status === "queued" || pollData.status === "running") {
        input.onProgress?.({
          status: String(rewritten.status || "running"),
          summary: rewritten.summary || "Booking in progress…",
          steps: rewritten.steps ?? [],
          screenshots: rewritten.screenshots ?? [],
          screenshot_url: rewritten.screenshot_url,
          hospital: rewritten.hospital || input.hospital_name,
        });
        continue;
      }
      return { ...rewritten, job_id: jobId };
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

/** Used by the media proxy route to fetch screenshot bytes from the VPS. */
export function browserAgentFetchAuth(): { base: string; token: string } | null {
  const base = agentBaseUrl();
  const token = agentToken();
  if (!base || !token) return null;
  return { base, token };
}
