import { createFileRoute } from "@tanstack/react-router";
import { resolveGoogleMapsKey } from "@/lib/places.server";

// Proxies Google Places photos so the API key never reaches the browser.
const NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export const Route = createFileRoute("/api/public/place-photo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const name = new URL(request.url).searchParams.get("name") ?? "";
        if (!NAME.test(name)) return new Response("Bad request", { status: 400 });
        const key = resolveGoogleMapsKey({ ...(import.meta.env as Record<string, string | undefined>), ...process.env });
        if (!key) return new Response("Unavailable", { status: 404 });
        const res = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=240&maxHeightPx=240&key=${key}`, {
          headers: { Referer: "https://allmasafetyai.online/" },
        });
        if (!res.ok || !res.body) return new Response("Not found", { status: 404 });
        return new Response(res.body, {
          headers: {
            "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
            "Cache-Control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
