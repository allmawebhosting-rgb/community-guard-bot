import { createFileRoute } from "@tanstack/react-router";
import { beginGoogleConnection, flowCookieHeader, isGoogleEmailConfigured } from "@/lib/gmail-connection.server";
import { userIdFromBearer } from "@/lib/request-auth.server";

/**
 * Starts the Google consent flow for the signed-in user. The browser keeps its Supabase session in
 * local storage, so the profile page calls this with its bearer token and then navigates to the
 * returned Google URL; a bare navigation could not prove who is signed in.
 */
export const Route = createFileRoute("/api/email/google/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await userIdFromBearer(request);
        if (!userId) return Response.json({ error: "sign_in_required" }, { status: 401 });
        if (!isGoogleEmailConfigured()) return Response.json({ error: "google_not_configured" }, { status: 503 });
        const url = new URL(request.url);
        const { url: googleUrl, cookie } = await beginGoogleConnection({ userId, origin: url.origin });
        return new Response(JSON.stringify({ url: googleUrl }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Set-Cookie": flowCookieHeader(cookie, url.protocol === "https:"),
          },
        });
      },
    },
  },
});
