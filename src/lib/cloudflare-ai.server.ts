import { createWorkersAI } from "workers-ai-provider";

// Cloudflare Workers AI binding, exposed by the Nitro Cloudflare preset on globalThis.__env__.
type AiBinding = { run: (model: string, input: unknown) => Promise<unknown> };

export const CF_CHAT_MODEL = "@cf/zai-org/glm-4.7-flash";
export const CF_WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";

export function getCloudflareAiBinding(): AiBinding | null {
  const env = (globalThis as { __env__?: { AI?: AiBinding } }).__env__;
  return env?.AI && typeof env.AI.run === "function" ? env.AI : null;
}

export function getCloudflareChatModel() {
  const binding = getCloudflareAiBinding();
  if (!binding) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createWorkersAI({ binding: binding as any })(CF_CHAT_MODEL as any);
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
