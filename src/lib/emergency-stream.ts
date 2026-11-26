import type { StartEmergencyResult } from "@/lib/emergency-contact.server";

export const EMERGENCY_TOOL_NAME = "emergency_contact";

/** What the chat card receives once the facility search has finished. */
export function emergencyToolOutput(result: StartEmergencyResult): Record<string, unknown> {
  if (!result.ok) return { failed: result.reason };
  if (result.reused) return { reused: true, run_id: null };
  return { ...result.view };
}

/** A line of plain text for cases the card cannot explain by itself. */
export function emergencyNote(result: StartEmergencyResult): string | null {
  if (!result.ok && result.reason === "no_location") {
    return "To contact nearby hospitals automatically I need to know where you are. Share your location, or tell me the town, and I will do it right away.";
  }
  return null;
}

/**
 * Minimal writer for the UI message stream: opens the card immediately and closes it with the
 * real run once the (slower) facility search resolves.
 */
export function createEmergencyCard(runPromise: Promise<StartEmergencyResult>) {
  const toolCallId = `allma-emergency-${Date.now()}`;
  let result: StartEmergencyResult | null = null;
  let opened = false;
  let closed = false;
  const settled = runPromise.then(
    (value) => {
      result = value;
      return value;
    },
    (): StartEmergencyResult => {
      result = { ok: false, reason: "unavailable" };
      return result;
    },
  );

  const open = () => {
    if (opened) return [];
    opened = true;
    return [{ type: "tool-input-available" as const, toolCallId, toolName: EMERGENCY_TOOL_NAME, input: {} }];
  };

  const finish = (value: StartEmergencyResult) => {
    if (closed) return [];
    closed = true;
    const chunks: Array<Record<string, unknown>> = [
      { type: "tool-output-available", toolCallId, output: emergencyToolOutput(value) },
    ];
    const note = emergencyNote(value);
    if (note) {
      const id = `${toolCallId}-note`;
      chunks.push({ type: "text-start", id }, { type: "text-delta", id, delta: note }, { type: "text-end", id });
    }
    return chunks;
  };

  return {
    open,
    /** Chunks to emit now if the search has already finished; otherwise none. */
    ready: () => (opened && !closed && result ? finish(result) : []),
    /** Waits for the search, then emits the remaining chunks. */
    async settle() {
      const chunks = open();
      const value = await settled;
      return [...chunks, ...finish(value)];
    },
  };
}
