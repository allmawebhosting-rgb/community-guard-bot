export type GatewayFailure = { status: number; message: string };

const creditMessage = "Allma's AI credits have run out. The app owner needs to top up credits before the assistant can reply.";

/** SDKs can wrap an API failure in NoOutputGeneratedError or RetryError. */
export function getGatewayFailure(error: unknown): GatewayFailure {
  const seen = new Set<object>();
  function find(value: unknown): GatewayFailure | undefined {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    const item = value as Record<string, unknown>;
    const nested = find(item.cause) ?? find(item.lastError);
    if (nested) return nested;
    const status = typeof item.statusCode === "number" ? item.statusCode : item.status;
    if (typeof status !== "number" || status < 400 || status > 599) return;
    let safeMessage: string | undefined;
    // Gateway JSON error messages are safe to surface; never expose SDK diagnostics.
    if (typeof item.responseBody === "string") {
      try {
        const body = JSON.parse(item.responseBody);
        const message = body?.message ?? body?.error?.message;
        if (typeof message === "string" && message.trim()) safeMessage = message;
      } catch { /* Non-JSON provider diagnostics stay server-side. */ }
    }
    return {
      status,
      message: safeMessage ?? (status === 402 ? creditMessage
        : status === 403 ? "Allma's AI access is blocked. Please contact the app owner."
        : status === 401 ? "Allma's AI connection is not configured correctly. Please contact the app owner."
        : status === 404 ? "Allma's AI service is currently unavailable. Please contact the app owner."
        : status === 429 ? "Allma is handling too many requests. Please wait before sending another message."
        : "Allma could not answer this message. Please try again later."),
    };
  }
  return find(error) ?? { status: 502, message: "Allma could not answer this message. Please try again later." };
}

export async function selectChatStream<T>(
  models: readonly string[],
  start: (model: string) => T & { warnings: PromiseLike<unknown> },
): Promise<{ result: T; model: string } | { failure: GatewayFailure }> {
  for (const model of models) {
    try {
      const result = start(model);
      await result.warnings;
      return { result, model };
    } catch (error) {
      // Credit, policy, access, model and configuration failures are terminal.
      // Do not switch providers or replay failed requests in this user action.
      return { failure: getGatewayFailure(error) };
    }
  }
  return { failure: getGatewayFailure(null) };
}