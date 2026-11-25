import { createFileRoute } from "@tanstack/react-router";
import { AFRICAS_TALKING_VOICE_XML } from "@/lib/africas-talking.server";

/**
 * Public Africa's Talking voice callback.
 * Configure this URL on the AT virtual number / sandbox app so answered
 * calls hear the SOS TTS announcement. No auth — AT servers POST here.
 */
function voiceXmlResponse() {
  return new Response(AFRICAS_TALKING_VOICE_XML, {
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
