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
};

function agentBaseUrl() {
  return (process.env.VPS_AGENT_BASE_URL || "").replace(/\/$/, "");
}

function agentToken() {
  return (process.env.VPS_AGENT_SECRET_TOKEN || "").trim();
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

export async function bookHospitalAppointment(
  input: BookAppointmentInput,
): Promise<BookAppointmentResult> {
  const base = agentBaseUrl();
  const token = agentToken();
  if (!base || !token) {
    return {
      status: "failed",
      hospital: input.hospital_name,
      summary:
        "Appointment booking agent is not configured. Set VPS_AGENT_BASE_URL and VPS_AGENT_SECRET_TOKEN.",
      screenshot_url: null,
      success: false,
      payment_required: false,
    };
  }

  try {
    const res = await fetch(`${base}/api/tasks/book-appointment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        hospital_name: input.hospital_name,
        preferred_time: input.preferred_time,
        reason_for_visit: input.reason_for_visit,
        patient_name: input.patient_name,
        phone_number: input.phone_number,
      }),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    const data = (await res.json().catch(() => null)) as BookAppointmentResult | null;
    if (!res.ok || !data) {
      return {
        status: "failed",
        hospital: input.hospital_name,
        summary: `Booking agent returned HTTP ${res.status}. If this is urgent, call Ambulance 911, Toll-free 112, or Police 999.`,
        screenshot_url: null,
        success: false,
        payment_required: false,
      };
    }
    return {
      ...data,
      screenshot_url: absoluteScreenshotUrl(data.screenshot_url) ?? data.screenshot_url ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "network error";
    return {
      status: "failed",
      hospital: input.hospital_name,
      summary: `Could not reach the booking agent (${message}). If urgent, call Ambulance 911, Toll-free 112, or Police 999.`,
      screenshot_url: null,
      success: false,
      payment_required: false,
      error: message,
    };
  }
}
