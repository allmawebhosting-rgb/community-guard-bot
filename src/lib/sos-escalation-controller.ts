import { requestVoiceCall, setCallStatus } from "@/lib/zego-call";
import {
  answeredAttempt,
  isTerminal,
  listSosCallAttempts,
  listSosCallTargets,
  isSosWelfareConfirmed,
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

/** How long all contacts are given to answer before another round starts. */
export const RING_WINDOW_MS = 42_000;
/** Pause before starting the next full round through the contact list. */
export const ROUND_GAP_SECONDS = 7 * 60;

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
  welfareConfirmed: boolean;
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
  welfareConfirmed: false,
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
  private loadingTargets = false;
  private autoStartRequested = false;
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
      const welfareConfirmed = await isSosWelfareConfirmed(this.activityId);
      this.patch({ attempts, answered: answeredAttempt(attempts) ?? null, welfareConfirmed });
    } catch {
      // A transient read failure must never break the emergency screen.
    }
  }

  async init(autoStart: boolean) {
    this.autoStartRequested = this.autoStartRequested || autoStart;
    // Re-entrant: a re-mount must never leave the card stuck on "loading" and
    // must re-arm auto-dialing if nothing is running yet.
    if (this.loadingTargets) return;
    if (this.initialised) {
      if (this.state.loading) this.patch({ loading: false });
      await this.refresh();
      if (
        this.autoStartRequested &&
        !this.state.running &&
        !this.state.answered &&
        this.callable().length
      ) {
        this.start();
      }
      return;
    }
    this.initialised = true;
    this.loadingTargets = true;
    try {
      const targets = await listSosCallTargets();
      this.patch({
        targets,
        noTargets: targets.length === 0,
        loading: false,
      });
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
    if (this.autoStartRequested && !this.state.answered && this.callable().length) this.start();
  }

  async retry(autoStart = true) {
    this.generation += 1;
    this.initialised = false;
    this.loadingTargets = false;
    this.autoStartRequested = autoStart;
    this.patch({ ...initialState() });
    await this.init(autoStart);
  }

  /**
   * Every configured Safety Network member is dialed. Whether a person can
   * actually be reached is decided by the real call attempt, not by a
   * pre-flight eligibility filter.
   */
  callable() {
    return this.state.targets;
  }

  start() {
    if (this.state.running || !this.callable().length) return;
    this.patch({ running: true, error: null });
    void this.loop(++this.generation);
  }

  stop() {
    this.generation += 1;
    this.patch({ running: false, currentIndex: -1, waitSeconds: null });
  }

  /** Rings every contact together, then repeats until someone answers. */
  private async loop(generation: number) {
    const alive = () => generation === this.generation && this.state.running;

    while (alive() && !this.state.welfareConfirmed) {
      this.patch({ round: this.state.round + 1 });
      const startedAt = Date.now();
      const targets = this.callable();
      this.patch({ currentIndex: -1, waitSeconds: null });

      targets.forEach((target) => {
        requestVoiceCall({
          id: target.member_id,
          name: target.full_name,
          avatarUrl: target.avatar_url,
          sosActivityId: this.activityId,
          emergencyType: this.emergencyType,
          onError: (message) => {
            if (!alive()) return;
            this.patch({
              error: message,
            });
          },
        });
      });

      const outcome = await this.waitForRoundOutcome(targets, startedAt, alive);
      if (!alive()) return;
      if (outcome) {
        const winner = this.state.answered;
        if (winner) {
          await Promise.all(
            this.state.attempts
              .filter((attempt) => attempt.call_id !== winner.call_id && !isTerminal(attempt.status))
              .map((attempt) => setCallStatus(attempt.call_id, "ended").catch(() => undefined)),
          );
        }
        this.patch({ currentIndex: -1, waitSeconds: null });
        if (this.state.welfareConfirmed) {
          this.patch({ running: false });
          return;
        }
        await this.countdown(ROUND_GAP_SECONDS, alive);
        continue;
      }

      this.patch({ currentIndex: -1 });
      await this.countdown(ROUND_GAP_SECONDS, alive);
    }
  }

  /** Waits until one real call connects, all calls finish, or the ring window expires. */
  private async waitForRoundOutcome(
    targets: SosCallTarget[],
    startedAt: number,
    alive: () => boolean,
  ): Promise<boolean> {
    while (alive() && Date.now() - startedAt < RING_WINDOW_MS) {
      await sleep(2500);
      if (!alive()) return false;
      await this.refresh();
      if (
        this.state.answered &&
        new Date(this.state.answered.created_at).getTime() >= startedAt - 15_000
      ) {
        return true;
      }
      const attempts = targets.map((target) =>
        [...this.state.attempts]
          .reverse()
          .find(
            (row) =>
              row.recipient_id === target.member_id &&
              new Date(row.created_at).getTime() >= startedAt - 15_000,
          ),
      );
      if (attempts.length === targets.length && attempts.every((attempt) => attempt && isTerminal(attempt.status))) {
        return false;
      }
    }
    return false;
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
