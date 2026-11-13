/** Live checklist shown in the pending assistant bubble until reply text arrives. */

export const CHAT_PROGRESS_LABELS = {
  understanding: "Understanding your message",
  finding: "Finding help near you",
  phones: "Checking phone numbers",
  writing: "Writing your answer",
} as const;

export type ChatProgressStepId = keyof typeof CHAT_PROGRESS_LABELS;
export type ChatProgressState = "done" | "active" | "pending";

export type ChatProgressStep = {
  id: ChatProgressStepId;
  label: string;
  state: ChatProgressState;
};

export function isChatProgressStepId(value: unknown): value is ChatProgressStepId {
  return typeof value === "string" && value in CHAT_PROGRESS_LABELS;
}

/** Read `data-chat-progress` parts the server streams during a reply. */
export function progressStepsFromParts(parts: Array<{ type: string; data?: unknown }> | undefined): ChatProgressStepId[] {
  const steps: ChatProgressStepId[] = [];
  for (const part of parts ?? []) {
    if (part.type !== "data-chat-progress") continue;
    const step = part.data && typeof part.data === "object" ? (part.data as { step?: unknown }).step : undefined;
    if (isChatProgressStepId(step) && !steps.includes(step)) steps.push(step);
  }
  return steps;
}

export type FindFacilitiesProgress = "none" | "running" | "done";

export function findFacilitiesProgress(
  parts: Array<{ type: string; state?: string }> | undefined,
): FindFacilitiesProgress {
  const part = (parts ?? []).find((p) => p.type === "tool-find_facilities");
  if (!part) return "none";
  return part.state === "output-available" || part.state === "output-error" ? "done" : "running";
}

export function assistantHasVisibleText(parts: Array<{ type: string; text?: string }> | undefined): boolean {
  return (parts ?? []).some((p) => p.type === "text" && typeof p.text === "string" && p.text.trim().length > 0);
}

/**
 * Steps to show while a reply is pending. Hidden once visible assistant text
 * starts arriving. "Finding help" and "Checking phone numbers" only appear when
 * that work is actually happening (server event or the places tool).
 */
export function chatProgressSteps(input: {
  status: string;
  hasVisibleText: boolean;
  serverSteps?: ChatProgressStepId[];
  findFacilities?: FindFacilitiesProgress;
}): ChatProgressStep[] | null {
  if (input.hasVisibleText) return null;
  if (input.status !== "submitted" && input.status !== "streaming") return null;

  const server = new Set(input.serverSteps ?? []);
  const find = input.findFacilities ?? "none";
  const includeFinding = server.has("finding") || server.has("phones") || find !== "none";
  const includePhones = server.has("phones");

  let current: ChatProgressStepId = "understanding";
  if (input.status === "streaming" && !includeFinding) current = "writing";
  if (includeFinding && (server.has("finding") || find !== "none")) current = "finding";
  if (includePhones && server.has("phones") && find !== "done") current = "phones";
  if (server.has("writing") || find === "done") current = "writing";

  const order: ChatProgressStepId[] = ["understanding"];
  if (includeFinding) order.push("finding");
  if (includePhones) order.push("phones");
  order.push("writing");

  const currentIndex = Math.max(0, order.indexOf(current));
  return order.map((id, index) => ({
    id,
    label: CHAT_PROGRESS_LABELS[id],
    state: index < currentIndex ? "done" : index === currentIndex ? "active" : "pending",
  }));
}
