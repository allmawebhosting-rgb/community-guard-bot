import { createFileRoute } from "@tanstack/react-router";

/**
 * Legacy Africa's Talking voice callback — unused after Infobip migration.
 * Kept so existing AT dashboard URLs do not 404; SOS GSM now uses Infobip TTS.
 */
const LEGACY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say playBeep="true">
    Emergency alert from Allma Safety. Your contact has activated an SOS.
    A live location tracking link has been sent to your mobile phone via SMS.
    Please check your messages immediately and assist.
  </Say>
</Response>`;

function voiceXmlResponse() {
  return new Response(LEGACY_XML, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/public/africas-talking-voice")({
  server: {
    handlers: {
      GET: async () => voiceXmlResponse(),
      POST: async () => voiceXmlResponse(),
    },
  },
});
