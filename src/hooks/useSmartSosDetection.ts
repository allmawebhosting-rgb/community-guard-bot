import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SMART_SOS_SETTINGS,
  logCheckEvent,
  loadSmartSosSettings,
  openSafetyCheck,
  requestAutoEscalation,
  resolveSafetyCheck,
  scoreSignals,
  type Confidence,
  type SignalKey,
  type SmartSosSettings,
} from "@/lib/smart-sos";

export type CheckPhase = "idle" | "checking" | "elevated";

/** Final cancellable countdown before automatic hand-off to SOS. */
const AUTO_ACTIVATION_SECONDS = 10;

const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
  "focus",
] as const;

type Options = {
  userId: string | null;
  paused?: boolean;
  onEscalate: (input: { checkId: string; signals: SignalKey[]; confidence: Confidence }) => void;
};

/**
 * Inactivity + motion + (consented, on-device) audio signal detection.
 * Motion and audio sensors only run while the app is in the foreground —
 * browsers do not permit background sensor access, and we never pretend they do.
 */
export function useSmartSosDetection({ userId, paused, onEscalate }: Options) {
  const [settings, setSettings] = useState<SmartSosSettings>(DEFAULT_SMART_SOS_SETTINGS);
  const [phase, setPhase] = useState<CheckPhase>("idle");
  const [signals, setSignals] = useState<SignalKey[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [autoSecondsLeft, setAutoSecondsLeft] = useState<number | null>(null);
  const [checkId, setCheckId] = useState<string | null>(null);
  const [audioActive, setAudioActive] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [escalationBlocked, setEscalationBlocked] = useState<string | null>(null);

  const idleTimer = useRef<number | null>(null);
  const tickTimer = useRef<number | null>(null);
  const phaseRef = useRef<CheckPhase>("idle");
  const signalsRef = useRef<SignalKey[]>([]);
  const checkIdRef = useRef<string | null>(null);
  const safetyConfirmedRef = useRef(false);
  const motionRef = useRef<{ lastSpikeAt: number; stillSince: number }>({
    lastSpikeAt: 0,
    stillSince: Date.now(),
  });
  const audioRef = useRef<{ ctx: AudioContext; stream: MediaStream; raf: number } | null>(null);

  phaseRef.current = phase;
  signalsRef.current = signals;
  checkIdRef.current = checkId;

  const { confidence } = useMemo(() => scoreSignals(signals), [signals]);

  const addSignal = useCallback((key: SignalKey) => {
    setSignals((current) => (current.includes(key) ? current : [...current, key]));
    if (checkIdRef.current) void logCheckEvent(checkIdRef.current, "signals_updated", { signal: key });
  }, []);

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    cancelAnimationFrame(audio.raf);
    audio.stream.getTracks().forEach((track) => track.stop());
    void audio.ctx.close();
    audioRef.current = null;
    setAudioActive(false);
  }, []);

  /**
   * On-device only: reads short-term loudness from the analyser node.
   * No audio is recorded, stored or uploaded anywhere.
   */
  const startAudio = useCallback(async () => {
    if (audioRef.current || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      const freq = new Uint8Array(analyser.frequencyBinCount);
      let loudFrames = 0;

      const sample = () => {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (const value of buffer) sum += value * value;
        const rms = Math.sqrt(sum / buffer.length);
        if (rms > 0.35) {
          loudFrames += 1;
          if (loudFrames === 3) addSignal("loud_impact");
          analyser.getByteFrequencyData(freq);
          const highBand = freq.slice(Math.floor(freq.length * 0.35), Math.floor(freq.length * 0.75));
          const highEnergy = highBand.reduce((a, b) => a + b, 0) / Math.max(highBand.length, 1);
          if (highEnergy > 150 && loudFrames > 6) addSignal("possible_distress_sound");
        } else {
          loudFrames = Math.max(0, loudFrames - 1);
        }
        const current = audioRef.current;
        if (current) current.raf = requestAnimationFrame(sample);
      };

      audioRef.current = { ctx, stream, raf: requestAnimationFrame(sample) };
      setAudioActive(true);
      setAudioError(null);
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : "Microphone unavailable");
      if (checkIdRef.current) {
        void logCheckEvent(checkIdRef.current, "monitoring_unavailable", { method: "audio" });
      }
    }
  }, [addSignal]);

  // Motion signals (foreground only).
  useEffect(() => {
    if (!settings.enabled || !settings.motion_detection || paused) return;
    function onMotion(event: DeviceMotionEvent) {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      const magnitude = Math.hypot(acc.x ?? 0, acc.y ?? 0, acc.z ?? 0);
      const now = Date.now();
      if (magnitude > 28) {
        motionRef.current.lastSpikeAt = now;
        addSignal("fall_like_motion");
      } else if (magnitude > 18) {
        motionRef.current.lastSpikeAt = now;
        addSignal("sudden_motion");
      } else if (magnitude < 12) {
        const spike = motionRef.current.lastSpikeAt;
        if (spike && now - spike > 4000 && now - spike < 60000) {
          addSignal("motion_then_stillness");
          motionRef.current.lastSpikeAt = 0;
        }
      }
    }
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [settings.enabled, settings.motion_detection, paused, addSignal]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void loadSmartSosSettings(userId).then((next) => {
      if (!cancelled) setSettings(next);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const reset = useCallback(() => {
    setPhase("idle");
    setSignals([]);
    setCheckId(null);
    setSecondsLeft(0);
    setEscalationBlocked(null);
    stopAudio();
  }, [stopAudio]);

  const beginCheck = useCallback(async () => {
    if (!userId || phaseRef.current !== "idle") return;
    safetyConfirmedRef.current = false;
    const initial: SignalKey[] = ["prolonged_inactivity"];
    setSignals(initial);
    setPhase("checking");
    setSecondsLeft(settings.grace_seconds);
    const id = await openSafetyCheck(userId, initial, "low");
    setCheckId(id);
    if (id) await logCheckEvent(id, "inactivity_detected", { seconds: settings.inactivity_seconds });
    if (settings.audio_detection) void startAudio();
  }, [userId, settings.grace_seconds, settings.inactivity_seconds, settings.audio_detection, startAudio]);

  // Inactivity watcher.
  useEffect(() => {
    if (!userId || !settings.enabled || paused) return;
    if (phase !== "idle") return;

    const schedule = () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        if (document.visibilityState === "visible") void beginCheck();
        else schedule();
      }, Math.max(5, settings.inactivity_seconds) * 1000);
    };

    const onActivity = () => schedule();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onActivity);
    schedule();

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
      document.removeEventListener("visibilitychange", onActivity);
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    };
  }, [userId, settings.enabled, settings.inactivity_seconds, paused, phase, beginCheck]);

  // Grace countdown while the check-in is showing.
  useEffect(() => {
    if (phase !== "checking") return;
    tickTimer.current = window.setInterval(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => {
      if (tickTimer.current !== null) window.clearInterval(tickTimer.current);
    };
  }, [phase]);

  // Grace elapsed with no response → score signals, ask the server for authorization.
  useEffect(() => {
    if (phase !== "checking" || secondsLeft > 0) return;
    const id = checkIdRef.current;
    const nextSignals = signalsRef.current.includes("no_response_to_check")
      ? signalsRef.current
      : [...signalsRef.current, "no_response_to_check" as SignalKey];
    setSignals(nextSignals);
    setPhase("elevated");
    const scored = scoreSignals(nextSignals);

    void (async () => {
      if (id) await logCheckEvent(id, "no_user_response", { confidence: scored.confidence });
      if (safetyConfirmedRef.current) return;
      const eligible = scored.confidence === "high" || scored.confidence === "medium";
      if (!id || !eligible || !settings.auto_escalation) {
        if (id && eligible && !settings.auto_escalation) {
          await logCheckEvent(id, "auto_sos_blocked", { reason: "auto_escalation_disabled" });
          setEscalationBlocked("auto_escalation_disabled");
        }
        return;
      }
      const result = await requestAutoEscalation(id, scored.confidence, nextSignals);
      if (safetyConfirmedRef.current) return;
      if (result.allowed) {
        setAutoSecondsLeft(AUTO_ACTIVATION_SECONDS);
        await logCheckEvent(id, "auto_sos_countdown_started", {
          seconds: AUTO_ACTIVATION_SECONDS,
          confidence: scored.confidence,
        });
      } else {
        setEscalationBlocked(result.reason);
        await logCheckEvent(id, "auto_sos_blocked", { reason: result.reason });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, secondsLeft]);

  // Authorized automatic activation: final countdown, then hand off to SOS.
  useEffect(() => {
    if (autoSecondsLeft === null) return;
    if (autoSecondsLeft <= 0) {
      const id = checkIdRef.current;
      const current = signalsRef.current;
      if (safetyConfirmedRef.current || !id) return;
      setAutoSecondsLeft(null);
      stopAudio();
      void logCheckEvent(id, "auto_sos_activated", { signals: current });
      onEscalate({ checkId: id, signals: current, confidence: scoreSignals(current).confidence });
      return;
    }
    const timer = window.setTimeout(() => {
      setAutoSecondsLeft((current) => (current === null ? null : current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [autoSecondsLeft, onEscalate, stopAudio]);


  const confirmSafe = useCallback(async () => {
    safetyConfirmedRef.current = true;
    const id = checkIdRef.current;
    reset();
    if (id) await resolveSafetyCheck(id, "safe", { source: "user_confirmed" });
  }, [reset]);

  const requestHelp = useCallback(async () => {
    const id = checkIdRef.current;
    const current = signalsRef.current;
    stopAudio();
    if (id) await resolveSafetyCheck(id, "help_requested", { source: "user_requested" });
    setPhase("idle");
    setSignals([]);
    setCheckId(null);
    if (id) onEscalate({ checkId: id, signals: current, confidence: "high" });
  }, [onEscalate, stopAudio]);

  useEffect(() => stopAudio, [stopAudio]);

  return {
    settings,
    setSettings,
    phase,
    signals,
    confidence,
    secondsLeft,
    audioActive,
    audioError,
    escalationBlocked,
    confirmSafe,
    requestHelp,
    dismiss: reset,
  };
}
