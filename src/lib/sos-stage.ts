import type { EscalationState } from "@/lib/sos-escalation-controller";

/** SOS order: 1) Safety Network online, 2) local phone calls to the network, 3) nearby help. */
export type NetworkStage = "online" | "local_calls" | "done";

export type NetworkStageInfo = {
  stage: NetworkStage;
  /** True once nearby help (hospitals, clinics, police) may start. */
  release: boolean;
  /** Why the network step ended, in plain words. */
  outcome: "answered" | "local_calls_finished" | "local_calls_unavailable" | null;
};

/** Longest the nearby-help step waits for the two network steps before starting anyway. */
export const NETWORK_STAGE_MAX_WAIT_MS = 150_000;

const TELECOM_FINISHED = new Set<string>([
  "completed",
  "partial",
  "failed",
  "skipped_duplicate",
  "not_configured",
  "no_contacts",
]);

type StageInput = Pick<EscalationState, "answered" | "welfareConfirmed" | "gsmEscalated" | "telecom"> | null;

export function networkStage(state: StageInput): NetworkStageInfo {
  if (!state) return { stage: "online", release: false, outcome: null };
  if (state.answered || state.welfareConfirmed) return { stage: "done", release: true, outcome: "answered" };
  if (TELECOM_FINISHED.has(state.telecom.status)) {
    const unavailable = ["failed", "not_configured", "no_contacts"].includes(state.telecom.status);
    return {
      stage: "done",
      release: true,
      outcome: unavailable ? "local_calls_unavailable" : "local_calls_finished",
    };
  }
  if (state.gsmEscalated) return { stage: "local_calls", release: false, outcome: null };
  return { stage: "online", release: false, outcome: null };
}

export type OrderStepState = "waiting" | "active" | "done" | "skipped";

export type OrderStep = { key: "online" | "local" | "nearby"; title: string; state: OrderStepState; note: string };

/** Three ordered steps shown on the emergency card. */
export function emergencyOrderSteps(input: {
  info: NetworkStageInfo | null;
  nearbyStarted: boolean;
  nearbyFinished: boolean;
  telecomMessage?: string | null;
}): OrderStep[] {
  const info = input.info ?? { stage: "online" as const, release: false, outcome: null };
  const answered = info.outcome === "answered";

  const online: OrderStep = {
    key: "online",
    title: "Safety Network online",
    state: info.stage === "online" ? "active" : "done",
    note:
      info.stage === "online"
        ? "Ringing your Safety Network in the app"
        : answered
          ? "Someone from your network answered"
          : info.outcome === null
            ? "No network call was running"
            : "No one answered in the app",
  };

  let local: OrderStep;
  if (answered) {
    local = { key: "local", title: "Local calls to your Safety Network", state: "skipped", note: "Not needed, someone answered" };
  } else if (info.stage === "local_calls") {
    local = {
      key: "local",
      title: "Local calls to your Safety Network",
      state: "active",
      note: "Calling their phones and sending SMS",
    };
  } else if (info.stage === "done" && info.outcome === null) {
    local = { key: "local", title: "Local calls to your Safety Network", state: "skipped", note: "No network call was running" };
  } else if (info.stage === "done") {
    local = {
      key: "local",
      title: "Local calls to your Safety Network",
      state: info.outcome === "local_calls_unavailable" ? "skipped" : "done",
      note:
        (info.outcome === "local_calls_unavailable" ? input.telecomMessage : null) ??
        (info.outcome === "local_calls_unavailable" ? "Phone calls could not be placed" : "Phones called and SMS sent"),
    };
  } else {
    local = { key: "local", title: "Local calls to your Safety Network", state: "waiting", note: "Starts if no one answers online" };
  }

  const nearby: OrderStep = {
    key: "nearby",
    title: "Nearby help",
    state: input.nearbyFinished ? "done" : input.nearbyStarted ? "active" : "waiting",
    note: input.nearbyFinished
      ? "Nearest facilities were contacted"
      : input.nearbyStarted
        ? "Calling the nearest first, one by one"
        : "Listed below, called last",
  };

  return [online, local, nearby];
}
