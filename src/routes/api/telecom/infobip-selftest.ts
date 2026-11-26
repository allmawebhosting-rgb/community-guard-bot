import { createFileRoute } from "@tanstack/react-router";
import {
  cleanInfobipApiKey,
  dispatchInfobipSms,
  dispatchInfobipTtsCall,
  isInfobipConfigured,
  normalizeInfobipBaseUrl,
  normalizeInfobipPhone,
} from "@/lib/infobip.server";

/** Infobip free-trial verified number only — never dial arbitrary numbers from this probe. */
const TRIAL_TO = "256774520951";

function runtimeEnv(name: string): string {
  const fromProcess = (process.env[name] || "").trim();
  if (fromProcess) return fromProcess;
  const cf = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  const fromCf = cf?.[name];
  return typeof fromCf === "string" ? fromCf.trim() : "";
}

/**
 * Authenticated Infobip smoke test (TTS + SMS to the trial number).
 * Authorization: Bearer <INFOBIP_SELFTEST_TOKEN>
 */
export const Route = createFileRoute("/api/telecom/infobip-selftest")({
  server: {
    handlers: {
      GET: async () => {
        const keyLen = runtimeEnv("INFOBIP_API_KEY").length;
        const base = runtimeEnv("INFOBIP_BASE_URL");
        const senderLen = runtimeEnv("INFOBIP_SENDER").length;
        const selftestLen = runtimeEnv("INFOBIP_SELFTEST_TOKEN").length;
        return Response.json({
          configured: isInfobipConfigured(),
          trialTo: TRIAL_TO,
          env: {
            INFOBIP_API_KEY: keyLen > 0,
            INFOBIP_API_KEY_len: keyLen,
            INFOBIP_API_KEY_cleaned_len: cleanInfobipApiKey(runtimeEnv("INFOBIP_API_KEY")).length,
            INFOBIP_BASE_URL: Boolean(base),
            INFOBIP_BASE_URL_host: base ? new URL(normalizeInfobipBaseUrl(base)).host : null,
            INFOBIP_SENDER: senderLen > 0,
            INFOBIP_SELFTEST_TOKEN: selftestLen > 0,
          },
          hint: "POST with Authorization: Bearer <INFOBIP_SELFTEST_TOKEN> to place a trial TTS+SMS.",
        });
      },
      POST: async ({ request }) => {
        const expected = runtimeEnv("INFOBIP_SELFTEST_TOKEN");
        const auth = request.headers.get("authorization") || "";
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        if (!expected || !token || token !== expected) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        if (!isInfobipConfigured()) {
          return Response.json(
            { ok: false, error: "infobip_not_configured" },
            { status: 503 },
          );
        }

        const to = normalizeInfobipPhone(`+${TRIAL_TO}`) || TRIAL_TO;
        if (to !== TRIAL_TO) {
          return Response.json({ ok: false, error: "trial_number_mismatch" }, { status: 400 });
        }

        const [voice, sms] = await Promise.all([
          dispatchInfobipTtsCall({
            to: TRIAL_TO,
            callerName: "Allma self-test",
          }),
          dispatchInfobipSms({
            to: TRIAL_TO,
            text: "EMERGENCY: Allma self-test triggered SOS. Live location: https://allmasafetyai.online/sos?id=selftest",
          }),
        ]);

        return Response.json({
          ok: voice.success || sms.success,
          trialTo: TRIAL_TO,
          voice: {
            success: voice.success,
            httpStatus: voice.httpStatus,
            messageId: voice.messageId ?? null,
            status: voice.status ?? null,
            error: voice.error ?? null,
          },
          sms: {
            success: sms.success,
            httpStatus: sms.httpStatus,
            messageId: sms.messageId ?? null,
            status: sms.status ?? null,
            error: sms.error ?? null,
          },
        });
      },
    },
  },
});
