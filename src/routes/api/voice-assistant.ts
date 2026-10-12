import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import { createLovableAiGatewayResponsesProvider } from "@/lib/ai-gateway.server";

const SYSTEM = `You are Allma, the voice safety assistant inside the Allma Safety AI app for Uganda.
You are warm, calm, very smart and genuinely helpful. Your answers are SPOKEN aloud, so:
- Reply in 1 to 4 short sentences of plain speech. No markdown, lists, emojis or URLs.
- If the person may be in danger, first tell them to get somewhere safe and say they can press the red SOS button. Uganda numbers: Police 999, Emergency 112.
- Never claim you contacted police, an ambulance or anyone else. You cannot place calls or send alerts yourself.
- You can help with: safety advice, theft (block SIM, freeze mobile money, IMEI tracking), lost and found, health questions, finding nearby police or hospitals (tell them to open Nearby help), Safety Network contacts, and how to use the app.
- If they ask to go to a part of the app, end your reply with exactly one tag on its own: [[NAV:/sos]] [[NAV:/nearby]] [[NAV:/chat]] [[NAV:/safety-network]] [[NAV:/lost-found]] [[NAV:/reports]] [[NAV:/profile]] [[NAV:/health-reminders]] [[NAV:/]].`;

type Turn = { role: "user" | "assistant"; content: string };

export const Route = createFileRoute("/api/voice-assistant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Voice assistant is not configured.", { status: 500 });
        let body: { messages?: Turn[]; path?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid request", { status: 400 });
        }
        const messages = (body.messages ?? [])
          .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-12)
          .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
        if (!messages.length) return new Response("No message", { status: 400 });

        const gateway = createLovableAiGatewayResponsesProvider(apiKey);
        try {
          const result = streamText({
            model: gateway.responses("openai/gpt-6-astra"),
            system: `${SYSTEM}\nThe user is currently on page: ${String(body.path ?? "/").slice(0, 80)}`,
            messages,
            abortSignal: request.signal,
            providerOptions: {
              openai: {
                forceReasoning: true,
                reasoningEffort: "low",
                reasoningSummary: "auto",
                store: false,
                include: ["reasoning.encrypted_content"],
              },
            },
          });
          const text = await result.text;
          return Response.json({ text });
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 429) return new Response("Allma is busy. Please try again in a moment.", { status: 429 });
          if (status === 402) return new Response("AI credits have run out for this workspace.", { status: 402 });
          if (request.signal.aborted) return new Response(null, { status: 499 });
          console.error("[voice-assistant]", error);
          return new Response("Allma could not answer right now.", { status: 502 });
        }
      },
    },
  },
});
