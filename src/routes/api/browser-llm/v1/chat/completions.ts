/**
 * OpenAI-compatible chat completions proxy backed by Cloudflare Workers AI.
 * Used by the VPS browser booking agent so it can reuse the same Workers AI
 * binding as Allma chat — no separate OpenAI key required.
 *
 * Auth: Authorization: Bearer <VPS_AGENT_SECRET_TOKEN>
 * Model default: @cf/meta/llama-3.3-70b-instruct-fp8-fast
 */
import { createFileRoute } from "@tanstack/react-router";
import { CF_CHAT_MODEL, getCloudflareAiBinding } from "@/lib/cloudflare-ai.server";

type ChatMessage = {
  role?: string;
  content?: unknown;
  name?: string;
  tool_calls?: unknown;
  tool_call_id?: string;
};

function bearerToken(request: Request): string {
  const h = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return (m?.[1] || "").trim();
}

function expectedToken(): string {
  const fromProcess = (process.env.VPS_AGENT_SECRET_TOKEN || "").trim();
  if (fromProcess) return fromProcess;
  const cf = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  const fromCf = cf?.VPS_AGENT_SECRET_TOKEN;
  return typeof fromCf === "string" ? fromCf.trim() : "";
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content == null) return "";
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function normalizeMessages(raw: unknown): Array<{ role: string; content: string }> {
  if (!Array.isArray(raw)) return [];
  return (raw as ChatMessage[])
    .map((m) => ({
      role: typeof m.role === "string" ? m.role : "user",
      content: textFromContent(m.content),
    }))
    .filter((m) => m.content.length > 0)
    .slice(-40);
}

function toOpenAiCompletion(model: string, content: string, toolCalls?: unknown) {
  const message: Record<string, unknown> = {
    role: "assistant",
    content: content || null,
  };
  if (Array.isArray(toolCalls) && toolCalls.length) {
    message.tool_calls = toolCalls;
  }
  return {
    id: `chatcmpl-allma-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: toolCalls && Array.isArray(toolCalls) && toolCalls.length ? "tool_calls" : "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

function extractAssistant(result: unknown): { content: string; tool_calls?: unknown } {
  if (result == null) return { content: "" };
  if (typeof result === "string") return { content: result };

  const obj = result as Record<string, unknown>;

  // OpenAI-style
  const choices = obj.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const msg = (choices[0] as { message?: Record<string, unknown> }).message;
    if (msg) {
      return {
        content: textFromContent(msg.content),
        tool_calls: msg.tool_calls,
      };
    }
  }

  // Workers AI legacy
  if (typeof obj.response === "string") {
    return { content: obj.response, tool_calls: obj.tool_calls };
  }

  // Some models return { result: "..." }
  if (typeof obj.result === "string") return { content: obj.result };

  try {
    return { content: JSON.stringify(obj) };
  } catch {
    return { content: String(result) };
  }
}

export const Route = createFileRoute("/api/browser-llm/v1/chat/completions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = expectedToken();
        if (!expected) {
          return Response.json(
            { error: { message: "VPS_AGENT_SECRET_TOKEN is not configured on the app.", type: "server_error" } },
            { status: 503 },
          );
        }
        const got = bearerToken(request);
        if (!got || got !== expected) {
          return Response.json(
            { error: { message: "Invalid bearer token.", type: "invalid_request_error" } },
            { status: 401 },
          );
        }

        const ai = getCloudflareAiBinding();
        if (!ai) {
          return Response.json(
            {
              error: {
                message:
                  "Workers AI binding is not available on this runtime. Deploy on Cloudflare Workers or set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN on the VPS agent.",
                type: "server_error",
              },
            },
            { status: 503 },
          );
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json(
            { error: { message: "Invalid JSON body.", type: "invalid_request_error" } },
            { status: 400 },
          );
        }

        const messages = normalizeMessages(body.messages);
        if (!messages.length) {
          return Response.json(
            { error: { message: "messages is required.", type: "invalid_request_error" } },
            { status: 400 },
          );
        }

        const requested =
          typeof body.model === "string" && body.model.trim() ? body.model.trim() : "";
        const model =
          requested.startsWith("@cf/") || requested.startsWith("@hf/")
            ? requested
            : (process.env.BROWSER_AGENT_MODEL || "").trim() ||
              "@cf/meta/llama-3.3-70b-instruct-fp8-fast" ||
              CF_CHAT_MODEL;

        const input: Record<string, unknown> = {
          messages,
          stream: false,
          temperature: typeof body.temperature === "number" ? body.temperature : 0,
        };
        if (typeof body.max_tokens === "number") input.max_tokens = body.max_tokens;
        if (Array.isArray(body.tools) && body.tools.length) input.tools = body.tools;
        if (body.tool_choice != null) input.tool_choice = body.tool_choice;

        try {
          const raw = await ai.run(model, input);
          const { content, tool_calls } = extractAssistant(raw);
          return Response.json(toOpenAiCompletion(model, content, tool_calls));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Workers AI call failed";
          return Response.json(
            { error: { message, type: "server_error" } },
            { status: 502 },
          );
        }
      },
    },
  },
});
