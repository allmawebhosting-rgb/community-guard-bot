import { createFileRoute } from "@tanstack/react-router";
import {
  OAUTH_FLOW_COOKIE,
  clearFlowCookieHeader,
  completeGoogleConnection,
  readCookie,
  verifyFlowCookie,
} from "@/lib/gmail-connection.server";

function back(origin: string, secure: boolean, status: "connected" | { error: string }) {
  const query =
    status === "connected" ? "gmail=connected" : `gmail=error&reason=${encodeURIComponent(status.error)}`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${origin}/profile?${query}`,
      "Set-Cookie": clearFlowCookieHeader(secure),
      "Cache-Control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/email/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const secure = url.protocol === "https:";
        const state = url.searchParams.get("state") ?? "";
        const cookie = readCookie(request.headers.get("cookie"), OAUTH_FLOW_COOKIE);
        const flow = cookie ? await verifyFlowCookie(cookie, state) : null;
        if (!flow || flow.origin !== url.origin) return back(url.origin, secure, { error: "invalid_state" });

        const code = url.searchParams.get("code");
        if (url.searchParams.get("error") || !code) {
          return back(flow.origin, secure, { error: url.searchParams.get("error") ? "cancelled" : "missing_code" });
        }
        const result = await completeGoogleConnection({
          userId: flow.userId,
          origin: flow.origin,
          code,
          verifier: flow.verifier,
        });
        return back(flow.origin, secure, result.ok ? "connected" : { error: result.error });
      },
    },
  },
});
