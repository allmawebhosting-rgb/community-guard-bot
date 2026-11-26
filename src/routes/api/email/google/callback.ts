import { createFileRoute } from "@tanstack/react-router";
import { completeGoogleConnection, verifyOAuthState } from "@/lib/gmail-connection.server";

function back(origin: string, status: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: `${origin}/profile?email=${encodeURIComponent(status)}` },
  });
}

export const Route = createFileRoute("/api/email/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const state = await verifyOAuthState(url.searchParams.get("state") ?? "");
        if (!state) return new Response("This connection link expired. Please try again.", { status: 400 });
        const code = url.searchParams.get("code");
        if (url.searchParams.get("error") || !code) return back(state.origin, "cancelled");
        const result = await completeGoogleConnection({
          userId: state.userId,
          origin: state.origin,
          code,
        });
        return back(state.origin, result.ok ? "connected" : result.error);
      },
    },
  },
});
