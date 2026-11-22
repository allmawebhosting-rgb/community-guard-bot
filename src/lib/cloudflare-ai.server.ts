import { createWorkersAI } from "workers-ai-provider";

// Cloudflare Workers AI binding, exposed by the Nitro Cloudflare preset on globalThis.__env__.
type AiBinding = { run: (model: string, input: unknown) => Promise<unknown> };

export const CF_CHAT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
export const CF_WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";

export function getCloudflareAiBinding(): AiBinding | null {
  const env = (globalThis as { __env__?: { AI?: AiBinding } }).__env__;
  return env?.AI && typeof env.AI.run === "function" ? env.AI : null;
}

export function getCloudflareChatModel() {
  const binding = getCloudflareAiBinding();
  if (!binding) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createWorkersAI({ binding: dedupeStreamBinding(binding) as any })(CF_CHAT_MODEL as any);
}

// Some Workers AI models stream legacy response/tool fields alongside OpenAI-style
// choices in the same SSE chunk; the provider can emit duplicate content and tool calls.
// The legacy fields can also arrive in their own chunk within a choices stream, so
// once any chunk in the stream carries `choices`, strip them from later chunks too.
export function dedupeSseLine(line: string, choicesSeen = false): string {
  if (!line.startsWith("data:")) return line;
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return line;
  try {
    const obj = JSON.parse(payload) as Record<string, unknown>;
    if (Array.isArray(obj["choices"])) {
      delete obj["response"];
      delete obj["tool_calls"];
      return `data: ${JSON.stringify(obj)}`;
    }
    if (choicesSeen && ("response" in obj || "tool_calls" in obj)) {
      delete obj["response"];
      delete obj["tool_calls"];
      return `data: ${JSON.stringify(obj)}`;
    }
  } catch {
    /* pass through */
  }
  return line;
}

function sseLineHasChoices(line: string): boolean {
  if (!line.startsWith("data:")) return false;
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return false;
  try {
    return Array.isArray((JSON.parse(payload) as Record<string, unknown>)["choices"]);
  } catch {
    return false;
  }
}

function dedupeStream(src: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = "";
  let choicesSeen = false;
  const processLine = (line: string): string => {
    const out = dedupeSseLine(line, choicesSeen);
    if (!choicesSeen && sseLineHasChoices(line)) choicesSeen = true;
    return out;
  };
  return src.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        buf += dec.decode(chunk, { stream: true });
        const parts = buf.split("\n");
        buf = parts.pop() ?? "";
        if (parts.length) ctrl.enqueue(enc.encode(parts.map(processLine).join("\n") + "\n"));
      },
      flush(ctrl) {
        buf += dec.decode();
        if (buf) ctrl.enqueue(enc.encode(processLine(buf)));
      },
    }),
  );
}

function dedupeStreamBinding(binding: AiBinding): AiBinding {
  return {
    ...binding,
    run: async (model: string, input: unknown, ...rest: unknown[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out = await (binding.run as any)(model, input, ...rest);
      if (out instanceof ReadableStream) return dedupeStream(out);
      // Non-streamed replies can carry the same duplicate fields on one object.
      if (
        out &&
        typeof out === "object" &&
        Array.isArray((out as Record<string, unknown>)["choices"]) &&
        ("response" in out || "tool_calls" in out)
      ) {
        const copy = { ...(out as Record<string, unknown>) };
        delete copy["response"];
        delete copy["tool_calls"];
        return copy;
      }
      return out;
    },
  };
}

export async function transcribeWithCloudflare(audio: File): Promise<string | null> {
  const binding = getCloudflareAiBinding();
  if (!binding) return null;
  const bytes = new Uint8Array(await audio.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const result = (await binding.run(CF_WHISPER_MODEL, { audio: btoa(binary) })) as { text?: string };
  return result?.text ?? "";
}
