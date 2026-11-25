import { createFileRoute } from "@tanstack/react-router";
import { browserAgentFetchAuth } from "@/lib/vps-browser-agent";

/**
 * HTTPS proxy for VPS booking screenshots.
 * The chat UI is served over HTTPS; the agent serves files over HTTP, so the
 * browser would block mixed-content images. This route fetches the PNG with
 * the Worker’s VPS token and streams it same-origin.
 */
export const Route = createFileRoute("/api/browser-agent-media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const path = (url.searchParams.get("path") || "").trim();
        if (!path.startsWith("/screenshots/") || path.includes("..")) {
          return new Response("Invalid screenshot path", { status: 400 });
        }

        const auth = browserAgentFetchAuth();
        if (!auth) {
          return new Response("Booking agent is not configured", { status: 503 });
        }

        try {
          const res = await fetch(`${auth.base}${path}`, {
            headers: { Authorization: `Bearer ${auth.token}` },
            signal: AbortSignal.timeout(30_000),
          });
          if (!res.ok) {
            return new Response(`Upstream ${res.status}`, { status: res.status === 404 ? 404 : 502 });
          }
          const bytes = await res.arrayBuffer();
          return new Response(bytes, {
            status: 200,
            headers: {
              "Content-Type": res.headers.get("content-type") || "image/png",
              "Cache-Control": "public, max-age=300",
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "fetch failed";
          return new Response(`Could not load screenshot (${message})`, { status: 502 });
        }
      },
    },
  },
});
