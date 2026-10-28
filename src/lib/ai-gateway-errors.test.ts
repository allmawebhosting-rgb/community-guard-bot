import { describe, expect, it, vi } from "vitest";
import { getGatewayFailure, selectChatStream } from "./ai-gateway-errors";

describe("AI credit and access failures", () => {
  it("returns 402 through NoOutputGeneratedError without starting the backup", async () => {
    const cause = { statusCode: 402, message: "Payment Required" };
    const start = vi.fn(() => ({ warnings: Promise.reject(new Error("No output", { cause })) }));
    const result = await selectChatStream(["openai/gpt-6-astra", "google/gemini-3.6-flash"], start);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith("openai/gpt-6-astra");
    expect(result).toMatchObject({ failure: { status: 402, message: expect.stringContaining("top up") } });
  });

  it("preserves the gateway credit remedy including temporary holds", () => {
    const message = "AI credits are temporarily held. The owner can top up credits or wait for holds to clear.";
    expect(getGatewayFailure({ cause: { statusCode: 402, responseBody: JSON.stringify({ message }) } }))
      .toEqual({ status: 402, message });
  });

  it.each([400, 401, 403, 404])("does not fall back or lose terminal status %s", async (statusCode) => {
    const start = vi.fn(() => ({ warnings: Promise.reject({ cause: { statusCode } }) }));
    expect(await selectChatStream(["primary", "backup"], start)).toMatchObject({ failure: { status: statusCode } });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("preserves safe provider denial reasons", () => {
    expect(getGatewayFailure({ statusCode: 403, responseBody: JSON.stringify({ error: { message: "Provider access denied." } }) }))
      .toEqual({ status: 403, message: "Provider access denied." });
  });

  it("returns a successfully opened stream unchanged", async () => {
    const stream = { warnings: Promise.resolve([]), id: "stream" };
    const start = vi.fn(() => stream);
    expect(await selectChatStream(["primary", "backup"], start)).toEqual({ result: stream, model: "primary" });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("handles cyclic causes without exposing diagnostics", () => {
    const error: { cause?: unknown; message: string } = { message: "secret diagnostics" };
    error.cause = error;
    expect(getGatewayFailure(error)).toEqual({ status: 502, message: "Allma could not answer this message. Please try again later." });
  });
});