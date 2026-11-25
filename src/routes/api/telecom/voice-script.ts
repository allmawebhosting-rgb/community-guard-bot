import { createFileRoute } from "@tanstack/react-router";
import {
  buildVoiceScriptText,
  renderVoiceScriptXml,
  verifyVoiceScriptToken,
} from "@/lib/telecom-call.server";

/**
 * TTS / IVR script for outbound GSM emergency calls.
 * Queried by Twilio (Url=) or configured as Africa's Talking voice callback.
 * Never includes raw phone numbers in the spoken script.
 */
async function handleVoiceScript(request: Request) {
  const url = new URL(request.url);
  let activityId = url.searchParams.get("activityId")?.trim() || "";
  let token = url.searchParams.get("token")?.trim() || "";
  let providerParam = url.searchParams.get("provider")?.trim() || "";

  if (request.method === "POST") {
    try {
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const form = await request.formData();
        activityId = activityId || String(form.get("activityId") || form.get("clientRequestId") || "").trim();
        token = token || String(form.get("token") || "").trim();
        providerParam = providerParam || String(form.get("provider") || "").trim();
      }
    } catch {
      // Keep query params.
    }
  }

  if (!activityId || !verifyVoiceScriptToken(activityId, token)) {
    return new Response("Forbidden", { status: 403 });
  }

  const ua = (request.headers.get("user-agent") || "").toLowerCase();
  const provider =
    providerParam === "twilio" || ua.includes("twilio")
      ? ("twilio" as const)
      : ("africas_talking" as const);

  let callerName = "an Allma user";
  let emergencyType = "an emergency";
  let locationText = "an unknown location";

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: activity } = await supabaseAdmin
      .from("safety_activity")
      .select("title, location_text, latitude, longitude, details, user_id")
      .eq("id", activityId)
      .maybeSingle();

    if (activity) {
      const details =
        activity.details && typeof activity.details === "object" && !Array.isArray(activity.details)
          ? (activity.details as Record<string, unknown>)
          : {};
      emergencyType =
        (typeof details.emergency_type === "string" && details.emergency_type) ||
        (typeof details.type === "string" && details.type) ||
        activity.title ||
        emergencyType;
      locationText =
        activity.location_text ||
        (activity.latitude != null && activity.longitude != null
          ? `${Number(activity.latitude).toFixed(3)}, ${Number(activity.longitude).toFixed(3)}`
          : locationText);

      if (activity.user_id) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", activity.user_id)
          .maybeSingle();
        if (profile?.full_name?.trim()) callerName = profile.full_name.trim().slice(0, 60);
      }
    }
  } catch (error) {
    console.warn("[telecom] voice script activity lookup failed", error);
  }

  const say = buildVoiceScriptText({
    callerName,
    emergencyType: String(emergencyType).slice(0, 80),
    locationText: String(locationText).slice(0, 120),
  });
  const xml = renderVoiceScriptXml(provider, say);
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/telecom/voice-script")({
  server: {
    handlers: {
      GET: async ({ request }) => handleVoiceScript(request),
      POST: async ({ request }) => handleVoiceScript(request),
    },
  },
});
