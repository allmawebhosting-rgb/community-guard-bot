import { supabase } from "@/integrations/supabase/client";

type TwilioCall = {
  on: (event: string, handler: (payload?: { message?: string }) => void) => void;
  accept: () => void;
  disconnect: () => void;
  mute: (muted: boolean) => void;
};

type TwilioDevice = {
  on: (event: string, handler: (payload?: TwilioCall) => void) => void;
  register: () => Promise<void>;
  updateToken: (token: string) => void;
  connect: (options: { params: Record<string, string> }) => Promise<TwilioCall>;
  audio?: { setSinkIds?: (ids: string[]) => Promise<void> };
};

type TwilioSdk = { Device: new (token: string, options: Record<string, unknown>) => TwilioDevice };

export type CallStatus =
  | "initiating"
  | "ringing"
  | "connecting"
  | "connected"
  | "declined"
  | "missed"
  | "ended"
  | "failed";

export type CallRow = {
  id: string;
  caller_id: string;
  recipient_id: string;
  status: string;
  created_at: string;
  connected_at: string | null;
};

export type CallHistoryEntry = {
  id: string;
  direction: "incoming" | "outgoing";
  other_user_id: string;
  full_name: string;
  avatar_url: string | null;
  status: string;
  duration: number | null;
  created_at: string;
};

export type CallPeer = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  /** Present only for calls placed from the caller's own active SOS. */
  sosActivityId?: string;
  /** Shown to the caller so the emergency context is explicit. */
  emergencyType?: string;
};

export type ConnectionQuality = "connecting" | "good" | "poor" | "reconnecting";

function friendly(message: string) {
  const clean = message.replace(/^.*?:\s*/, "").trim();
  return clean || "The call could not be placed.";
}

export async function startVoiceCall(recipientId: string) {
  const { data, error } = await supabase.rpc("start_voice_call", {
    p_recipient_id: recipientId,
  });
  if (error) throw new Error(friendly(error.message));
  return data as string;
}

export async function setCallStatus(callId: string, status: CallStatus, reason?: string) {
  const { error } = await supabase.rpc("update_voice_call", {
    p_call_id: callId,
    p_status: status,
    p_reason: reason ?? undefined,
  });
  if (error) throw new Error(friendly(error.message));
}

export async function listMyCalls(limit = 30): Promise<CallHistoryEntry[]> {
  const { data, error } = await supabase.rpc("list_my_calls", { p_limit: limit });
  if (error) throw new Error(friendly(error.message));
  return (data ?? []) as CallHistoryEntry[];
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Last-resort fallback if the ICE endpoint itself is unreachable. Public STUN
 * alone cannot traverse symmetric / carrier-grade NAT, so relay-less calls can
 * still fail on some mobile networks — the UI says so rather than pretending.
 */
const FALLBACK_ICE: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

async function fetchIceConfig(callId: string): Promise<{ iceServers: RTCIceServer[]; relay: boolean }> {
  try {
    const config = await getIceConfig({ data: { callId } });
    return { iceServers: config.iceServers as RTCIceServer[], relay: config.relay };
  } catch {
    return { iceServers: FALLBACK_ICE, relay: false };
  }
}

export function microphoneErrorMessage(error: unknown) {
  const name = (error as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Your microphone is unavailable. Please allow Allma to access your microphone.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found on this device.";
  }
  if (name === "NotReadableError") {
    return "Your microphone is being used by another app. Close it and try again.";
  }
  return "Allma could not start audio on this device.";
}

type EngineEvents = {
  onQuality: (quality: ConnectionQuality) => void;
  onConnected: () => void;
  onFailed: (message: string) => void;
  onEnded?: () => void;
  /** True when a TURN relay credential was issued for this call. */
  onRelay?: (relay: boolean) => void;
};

type TwilioTokenResponse = { token: string };

let device: TwilioDevice | null = null;
let devicePromise: Promise<TwilioDevice> | null = null;
const incomingCalls = new Map<string, TwilioCall>();

async function loadTwilioSdk(): Promise<TwilioSdk> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<TwilioSdk>;
    return await dynamicImport("@twilio/voice-sdk");
  } catch {
    throw new Error("Twilio Voice is not installed or configured on this device.");
  }
}

function incomingCallId(call: TwilioCall) {
  const parameters = (call as unknown as { parameters?: Record<string, string> }).parameters;
  if (parameters?.callId) return parameters.callId;
  const customParameters = (call as unknown as { customParameters?: Map<string, string> })
    .customParameters;
  return customParameters?.get("callId") ?? null;
}

async function getTwilioToken(callId?: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Sign in is required before starting an Allma call.");
  }
  const response = await fetch("/api/voice-token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify(callId ? { callId } : {}),
  });
  const payload = (await response.json().catch(() => ({}))) as TwilioTokenResponse & {
    error?: string;
  };
  if (!response.ok || !payload.token) {
    throw new Error(payload.error ?? "Twilio Voice is not available.");
  }
  return payload.token;
}

async function getDevice() {
  if (device) return device;
  if (devicePromise) return devicePromise;
  devicePromise = (async () => {
    const { Device } = await loadTwilioSdk();
    const next = new Device(await getTwilioToken(), {
      codecPreferences: ["opus", "pcmu"],
      enableRingingState: true,
    });
    next.on("incoming", (call) => {
      const callId = incomingCallId(call);
      if (callId) incomingCalls.set(callId, call);
    });
    next.on("tokenWillExpire", () => {
      void getTwilioToken().then((token) => next.updateToken(token)).catch(() => undefined);
    });
    await next.register();
    device = next;
    return next;
  })();
  try {
    return await devicePromise;
  } finally {
    devicePromise = null;
  }
}

/** Registers the authenticated user's Twilio Device for in-app incoming calls. */
export async function registerVoiceDevice() {
  if (typeof window === "undefined") return;
  await getDevice();
}

/**
 * Real Twilio Voice transport. Authorization, tokens, TwiML routing, and
 * authoritative call state remain server-side; this class only owns audio.
 */
export class VoiceCallEngine {
  private call: TwilioCall | null = null;
  private closed = false;

  constructor(
    private readonly callId: string,
    private readonly userId: string,
    private readonly isCaller: boolean,
    private readonly events: EngineEvents,
  ) {}

  async start() {
    if (typeof window === "undefined") throw new Error("Voice calls require a browser or native app.");
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone access is required to make a voice call.");
    }
    const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
    microphone.getTracks().forEach((track) => track.stop());
    const twilioDevice = await getDevice();
    this.call = this.isCaller
      ? await twilioDevice.connect({ params: { callId: this.callId } })
      : await waitForIncomingCall(this.callId);
    if (!this.call) throw new Error("The incoming call is no longer available.");
    if (!this.isCaller) this.call.accept();
    this.bindCall(this.call);
  }

  private bindCall(call: TwilioCall) {
    call.on("ringing", () => this.events.onQuality("connecting"));
    call.on("accept", () => {
      if (this.closed) return;
      this.events.onQuality("good");
      this.events.onConnected();
    });
    call.on("reconnecting", () => this.events.onQuality("reconnecting"));
    call.on("reconnected", () => this.events.onQuality("good"));
    call.on("disconnect", () => {
      if (!this.closed) this.events.onEnded?.();
    });
    call.on("cancel", () => this.events.onFailed("The call was not answered."));
    call.on("reject", () => this.events.onFailed("The call was declined."));
    call.on("error", (error) => this.events.onFailed(error.message || "The call failed."));
  }
  setMuted(muted: boolean) {
    this.call?.mute(muted);
  }

  async setSpeaker(on: boolean) {
    const audio = device?.audio;
    if (!audio?.setSinkIds) return false;
    try {
      await audio.setSinkIds([on ? "default" : ""]);
      return true;
    } catch {
      return false;
    }
  }

  close() {
    this.closed = true;
    this.call?.disconnect();
    incomingCalls.delete(this.callId);
    this.call = null;
  }
}

async function waitForIncomingCall(callId: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const call = incomingCalls.get(callId);
    if (call) return call;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

const CALL_EVENT = "allma:start-call";

/** Lets any screen trigger the global call UI without prop drilling. */
export function requestVoiceCall(peer: CallPeer) {
  window.dispatchEvent(new CustomEvent<CallPeer>(CALL_EVENT, { detail: peer }));
}

export function onVoiceCallRequest(handler: (peer: CallPeer) => void) {
  const listener = (event: Event) => handler((event as CustomEvent<CallPeer>).detail);
  window.addEventListener(CALL_EVENT, listener);
  return () => window.removeEventListener(CALL_EVENT, listener);
}
