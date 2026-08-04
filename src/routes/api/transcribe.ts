import { createFileRoute } from "@tanstack/react-router";

const MAX_BYTES = 20 * 1024 * 1024;

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response("Voice input is not configured yet.", { status: 500 });
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return new Response("Expected multipart/form-data", { status: 400 });
        }

        const audio = form.get("audio");
        if (!(audio instanceof File) || audio.size === 0) {
          return new Response("No audio was uploaded.", { status: 400 });
        }
        if (audio.size > MAX_BYTES) {
          return new Response("That recording is too long.", { status: 413 });
        }

        const upstream = new FormData();
        upstream.append("model", "openai/gpt-4o-mini-transcribe");
        upstream.append("file", audio, "recording.wav");

        const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: upstream,
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          console.error("Transcription failed", response.status, detail);
          return new Response(
            response.status === 429
              ? "Too many requests — please try again in a moment."
              : response.status === 402
                ? "AI credits are exhausted for this workspace."
                : "Could not transcribe that recording.",
            { status: response.status },
          );
        }

        const data = (await response.json()) as { text?: string };
        return Response.json({ text: data.text ?? "" });
      },
    },
  },
});

