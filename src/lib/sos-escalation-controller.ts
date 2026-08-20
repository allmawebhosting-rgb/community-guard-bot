import { requestVoiceCall } from "@/lib/zego-call";
import {
  answeredAttempt,
  isTerminal,
  listSosCallAttempts,
  listSosCallTargets,
  type SosCallAttempt,
  type SosCallTarget,
} from "@/lib/sos-calling";

/**
 * One dialer per SOS session, shared by every mounted view.
 *
 * The SOS screen renders its layout twice (mobile + desktop columns), so the
 * escalation UI can be mounted more than once. Keeping the dialing state in a
 * module-level controller guarantees a single call sequence per emergency —
 * two independent dialers used to fight over the same session and cut calls
 * short. Every status still comes from real `emergency_calls` rows.
 */

/** How long a single contact is given to answer before moving to the next one. */
export const RING_WINDOW_MS = 42_000;
/** Pause between contacts inside one round. */
export const GAP_SECONDS = 4;
/** Pause before starting the next full round through the contact list. */
export const ROUND_GAP_SECONDS = 20;

export type EscalationState = {
  loading: boolean;
  running: boolean;
  round: number;
  currentIndex: number;
  waitSeconds: number | null;
  targets: SosCallTarget[];
  attempts: SosCallAttempt[];
  answered: SosCallAttempt | null;
  noTargets: boolean;
  error: string | null;
};

const initialState = (): EscalationState => ({
  loading: true,
  running: false,
  round: 0,
  currentIndex: -1,
  waitSeconds: null,
  targets: [],
  attempts: [],
  answered: null,
  noTargets: false,
  error: null,
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Grace period before a controller with no subscribers is torn down. The SOS
 * screen re-renders (and briefly unsubscribes) whenever the emergency type or
 * layout changes; disposing immediately used to kill the dialer mid-emergency.
 */
const DISPOSE_GRACE_MS = 8_000;

class SosEscalation {
  state = initialState();
  private listeners = new Set<() => void>();
  private generation = 0;
  private initialised = false;
  private disposeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly activityId: string,
    private emergencyType: string,
  ) {}

  setEmergencyType(type: string) {
    this.emergencyType = type;
  }

  subscribe(listener: () => void) {
    if (this.disposeTimer) {
      clearTimeout(this.disposeTimer);
      this.disposeTimer = null;
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      // Only tear down if nothing re-subscribes shortly after (real close of
      // the SOS screen), never on a transient re-render.
      if (this.listeners.size > 0) return;
      if (this.disposeTimer) clearTimeout(this.disposeTimer);
      this.disposeTimer = setTimeout(() => {
        this.disposeTimer = null;
        if (this.listeners.size === 0) disposeSosEscalation(this.activityId);
      }, DISPOSE_GRACE_MS);
    };
  }

  private patch(partial: Partial<EscalationState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((listener) => listener());
  }

  private async refresh() {
    try {
      const attempts = await listSosCallAttempts(this.activityId);
      this.patch({ attempts, answered: answeredAttempt(attempts) ?? null });
    } catch {
      // A transient read failure must never break the emergency screen.
    }
  }

  async init(autoStart: boolean) {
    // Re-entrant: a re-mount must never leave the card stuck on "loading" and
    // must re-arm auto-dialing if nothing is running yet.
    if (this.loadingTargets) return;
    if (this.initialised) {
      if (this.state.loading) this.patch({ loading: false });
      await this.refresh();
      if (autoStart && !this.state.running && !this.state.answered && this.state.targets.length) {
        this.start();
      }
      return;
    }
    this.initialised = true;
    this.loadingTargets = true;
    try {
      const targets = await listSosCallTargets();
      this.patch({ targets, noTargets: targets.length === 0, loading: false });
    } catch (error) {
      this.patch({
        loading: false,
        targets: [],
        noTargets: true,
        error: error instanceof Error ? error.message : "Contacts could not be loaded.",
      });
      return;
    } finally {
      this.loadingTargets = false;
    }
    await this.refresh();
    if (autoStart && !this.state.answered && this.state.targets.length) this.start();
  }

  async retry(autoStart = true) {
    this.generation += 1;
    this.initialised = false;
    this.loadingTargets = false;
    this.patch({ ...initialState() });
    await this.init(autoStart);
  }

  start() {
    if (this.state.running || !this.state.targets.length) return;
    this.patch({ running: true, error: null });
    void this.loop(++this.generation);
  }

  stop() {
    this.generation += 1;
    this.patch({ running: false, currentIndex: -1, waitSeconds: null });
  }

  /** Rings each contact in priority order, then keeps repeating rounds until someone answers. */
  private async loop(generation: number) {
    const alive = () => generation === this.generation && this.state.running;

    while (alive()) {
      this.patch({ round: this.state.round + 1 });

      for (let index = 0; index < this.state.targets.length; index += 1) {
        if (!alive()) return;
        const target = this.state.targets[index];
        if (!target) continue;

        this.patch({ currentIndex: index, waitSeconds: null });
        const startedAt = Date.now();
        requestVoiceCall({
          id: target.member_id,
          name: target.full_name,
          avatarUrl: target.avatar_url,
          sosActivityId: this.activityId,
          emergencyType: this.emergencyType,
        });

        const outcome = await this.waitForOutcome(target.member_id, startedAt, alive);
        if (!alive()) return;
        if (outcome === "answered") {
          this.patch({ running: false, currentIndex: -1, waitSeconds: null });
          return;
        }

        if (index < this.state.targets.length - 1) await this.countdown(GAP_SECONDS, alive);
      }

      if (!alive()) return;
      this.patch({ currentIndex: -1 });
      await this.countdown(ROUND_GAP_SECONDS, alive);
    }
  }

  /** Waits on the real call row: answered, finished without an answer, or the ring window elapsed. */
  private async waitForOutcome(
    recipientId: string,
    startedAt: number,
    alive: () => boolean,
  ): Promise<"answered" | "no_answer"> {
    while (alive() && Date.now() - startedAt < RING_WINDOW_MS) {
      await sleep(2500);
      if (!alive()) return "no_answer";
      await this.refresh();
      if (this.state.answered) return "answered";
      const attempt = [...this.state.attempts]
        .reverse()
        .find(
          (row) =>
            row.recipient_id === recipientId &&
            new Date(row.created_at).getTime() >= startedAt - 15_000,
        );
      if (!attempt) continue;
      if (attempt.connected_at) return "answered";
      if (isTerminal(attempt.status)) return "no_answer";
    }
    return "no_answer";
  }

  private async countdown(seconds: number, alive: () => boolean) {
    for (let remaining = seconds; remaining > 0; remaining -= 1) {
      if (!alive()) return;
      this.patch({ waitSeconds: remaining });
      await sleep(1000);
    }
    this.patch({ waitSeconds: null });
  }
}

const controllers = new Map<string, SosEscalation>();

export function getSosEscalation(activityId: string, emergencyType: string) {
  let controller = controllers.get(activityId);
  if (!controller) {
    controller = new SosEscalation(activityId, emergencyType);
    controllers.set(activityId, controller);
  }
  controller.setEmergencyType(emergencyType);
  return controller;
}

export function disposeSosEscalation(activityId: string) {
  const controller = controllers.get(activityId);
  if (!controller) return;
  controller.stop();
  controllers.delete(activityId);
}

export type { SosCallAttempt, SosCallTarget };
