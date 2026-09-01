import { supabase } from "@/integrations/supabase/client";

type ZegoCall = {
  on: (event: string, handler: (...args: any[]) => void) => void;
  accept?: () => void;
  disconnect?: () => void;
  mute?: (muted: boolean) => void;
};

type ZegoEngine = {
  createStream: (config: { camera: { video: boolean }; microphone: boolean }) => Promise<MediaStream>;
  loginRoom: (
    roomId: string,
    token: string,
    user: { userID: string; userName: string },
    options?: Record<string, unknown>,
  ) => Promise<boolean>;
  logoutRoom: (roomId: string) => Promise<void>;
  startPublishingStream: (streamId: string, stream: MediaStream) => Promise<void>;
  stopPublishingStream: (streamId: string) => void;
  destroyStream: (stream: MediaStream) => void;
  startPlayingStream: (streamId: string) => Promise<MediaStream>;
  stopPlayingStream: (streamId: string) => void;
  destroyEngine: () => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
  muteMicrophone: (muted: boolean) => void;
  setAudioRouteToSpeaker?: (enabled: boolean) => void;
};

type ZegoSdk = {
  ZegoExpressEngine: new (appId: number, server: string) => ZegoEngine;
};

type ZegoTokenResponse = {
  token: string;
  appId: number;
  server: string;
  roomId: string;
  userId: string;
};

export type CallStatus =
  | "initiating"
  | "ringing"
  | "connecting"
  | "connected"
  | "declined"
  | "missed"
  | "ended"
  | "failed";

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
  sosActivityId?: string;
  emergencyType?: string;
  onError?: (message: string) => void;
  microphoneStream?: MediaStream;
};

export type ConnectionQuality = "connecting" | "good" | "poor" | "reconnecting";

function friendly(message: string) {
  return message.replace(/^.*?:\s*/, "").trim() || "The call could not be placed.";
}

export async function startVoiceCall(recipientId: string) {
  const { data, error } = await supabase.rpc("start_voice_call", { p_recipient_id: recipientId });
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
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function microphoneErrorMessage(error: unknown) {
  const name = (error as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "ALLMA needs microphone access to make this call.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found on this device.";
  }
  if (name === "NotReadableError") return "Your microphone is being used by another app.";
  return "Allma could not start audio on this device.";
}

export async function primeMicrophone() {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone access is required for an Allma voice call.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    throw error;
  }
}

async function getZegoToken(callId: string): Promise<ZegoTokenResponse> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Sign in is required before starting an Allma call.");
  }
  const response = await fetch("/api/zego-token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify({ callId }),
  });
  const payload = (await response.json().catch(() => ({}))) as ZegoTokenResponse & {
    error?: string;
    code?: string;
  };
  if (!response.ok || !payload.token) {
    console.error("[ALLMA VOICE] token request failed", {
      callId,
      status: response.status,
      code: payload.code ?? "TOKEN_REQUEST_FAILED",
      message: payload.error ?? "ZEGOCLOUD is not available.",
    });
    throw new Error(payload.error ?? "Unable to authenticate voice session.");
  }
  return payload;
}

async function loadZegoSdk(): Promise<ZegoSdk> {
  try {
    const importModule = new Function("modulePath", "return import(modulePath)") as (
      modulePath: string,
    ) => Promise<ZegoSdk | { default: ZegoSdk }>;
    const mod = await importModule("zego-express-engine-webrtc");
    const sdk = (mod as { default?: ZegoSdk }).default ?? (mod as ZegoSdk);
    if (!sdk?.ZegoExpressEngine) throw new Error("missing engine");
    return sdk;
  } catch (error) {
    console.error("Failed to load ZEGOCLOUD Voice SDK", error);
    throw new Error("Allma could not load the voice calling engine. Please refresh and try again.");
  }
}


/** Incoming UI remains owned by ALLMA realtime call records; Zego joins after Answer. */
export async function registerVoiceDevice() {}

type EngineEvents = {
  onQuality: (quality: ConnectionQuality) => void;
  onConnected: () => void;
  onFailed: (message: string) => void;
  onEnded?: () => void;
};

export class VoiceCallEngine {
  private engine: ZegoEngine | null = null;
  private roomId: string | null = null;
  private publishStreamId: string | null = null;
  private localStream: MediaStream | null = null;
  private remoteStreamIds = new Set<string>();
  private audioElements = new Map<string, HTMLAudioElement>();
  private closed = false;

  constructor(
    private readonly callId: string,
    private readonly userId: string,
    private readonly isCaller: boolean,
    private readonly events: EngineEvents,
    private readonly prewarmedStream?: MediaStream,
  ) {}

  async start() {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone access is required for an Allma voice call.");
    }
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      throw new Error("Voice calls require a secure HTTPS connection.");
    }
    const token = await getZegoToken(this.callId);
    console.info("[ALLMA VOICE] token received", {
      callId: this.callId,
      roomId: token.roomId,
      userId: token.userId,
      appIdConfigured: Number.isSafeInteger(token.appId) && token.appId > 0,
    });
    const sdk = await loadZegoSdk();
    const engine = new sdk.ZegoExpressEngine(token.appId, token.server);
    this.engine = engine;
    this.roomId = token.roomId;
    this.publishStreamId = `allma-audio-${this.callId}-${this.userId}`;
    engine.on("roomStateUpdate", (_roomId: string, state: string, errorCode: number) => {
      if (this.closed) return;
      if (state === "CONNECTING") this.events.onQuality("connecting");
      if (state === "DISCONNECTED") {
        this.events.onQuality("reconnecting");
        if (errorCode) this.events.onFailed("Call ended because the connection was lost.");
      }
      if (state === "CONNECTED") this.events.onQuality("connecting");
    });
    engine.on("roomStreamUpdate", (_roomId: string, updateType: string, streams: Array<{ streamID: string }>) => {
      if (updateType === "ADD") {
        streams.forEach((stream) => void this.playRemote(stream.streamID));
      } else if (updateType === "DELETE") {
        streams.forEach((stream) => this.stopRemote(stream.streamID));
      }
    });
    let loggedIn = false;
    try {
      loggedIn = await engine.loginRoom(
        token.roomId,
        token.token,
        { userID: token.userId, userName: this.userId },
        { userUpdate: true },
      );
    } catch (error) {
      console.error("[ALLMA VOICE] room join failed", {
        callId: this.callId,
        roomId: token.roomId,
        userId: token.userId,
        message: error instanceof Error ? error.message : "unknown",
      });
      throw new Error("Unable to join the ZEGOCLOUD voice room.");
    }
    if (!loggedIn) throw new Error("Unable to join the ZEGOCLOUD voice room.");
    let microphone: MediaStream;
    try {
      microphone = this.prewarmedStream ?? await engine.createStream({ camera: { video: false }, microphone: true });
      this.localStream = microphone;
      await engine.startPublishingStream(this.publishStreamId, microphone);
    } catch (error) {
      console.error("[ALLMA VOICE] microphone stream failed", {
        callId: this.callId,
        roomId: this.roomId,
        message: error instanceof Error ? error.message : "unknown",
      });
      throw new Error("Microphone access is required for an Allma voice call.");
    }
    console.info("[ALLMA VOICE] room joined and audio published", {
      callId: this.callId,
      roomId: token.roomId,
      userId: token.userId,
    });
    this.events.onQuality("connecting");
  }

  private async playRemote(streamId: string) {
    if (this.closed || this.remoteStreamIds.has(streamId) || !this.engine) return;
    this.remoteStreamIds.add(streamId);
    try {
      const stream = await this.engine.startPlayingStream(streamId);
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("aria-hidden", "true");
      audio.srcObject = stream;
      document.body.appendChild(audio);
      await audio.play();
      this.audioElements.set(streamId, audio);
      this.events.onQuality("good");
      this.events.onConnected();
    } catch (error) {
      console.error("[ALLMA VOICE] remote audio failed", {
        callId: this.callId,
        roomId: this.roomId,
        streamId,
        message: error instanceof Error ? error.message : "unknown",
      });
      this.events.onFailed("Unable to start remote voice audio.");
    }
  }

  private stopRemote(streamId: string) {
    this.engine?.stopPlayingStream(streamId);
    this.audioElements.get(streamId)?.remove();
    this.audioElements.delete(streamId);
    this.remoteStreamIds.delete(streamId);
    if (!this.closed && this.remoteStreamIds.size === 0) this.events.onQuality("reconnecting");
  }

  setMuted(muted: boolean) {
    this.engine?.muteMicrophone(muted);
  }

  async setSpeaker(on: boolean) {
    this.engine?.setAudioRouteToSpeaker?.(on);
    return Boolean(this.engine?.setAudioRouteToSpeaker);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.engine && this.roomId) {
      if (this.publishStreamId) this.engine.stopPublishingStream(this.publishStreamId);
      if (this.localStream) this.engine.destroyStream(this.localStream);
      this.remoteStreamIds.forEach((streamId) => this.engine?.stopPlayingStream(streamId));
      void this.engine.logoutRoom(this.roomId);
      this.engine.destroyEngine();
    }
    this.audioElements.forEach((audio) => audio.remove());
    this.audioElements.clear();
    this.remoteStreamIds.clear();
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.engine = null;
  }
}

const CALL_EVENT = "allma:start-call";
const pendingVoiceCalls: CallPeer[] = [];
let voiceCallListenerCount = 0;

export function requestVoiceCall(peer: CallPeer) {
  // SOS may auto-start before CallCenter has finished restoring the signed-in
  // user. A browser event has no replay, so retain the real request until the
  // call listener is ready instead of silently losing the first call.
  if (voiceCallListenerCount === 0) {
    pendingVoiceCalls.push(peer);
    return;
  }
  window.dispatchEvent(new CustomEvent<CallPeer>(CALL_EVENT, { detail: peer }));
}

export function onVoiceCallRequest(handler: (peer: CallPeer) => void) {
  const listener = (event: Event) => handler((event as CustomEvent<CallPeer>).detail);
  voiceCallListenerCount += 1;
  window.addEventListener(CALL_EVENT, listener);
  const queued = pendingVoiceCalls.splice(0);
  queued.forEach((peer) => queueMicrotask(() => handler(peer)));
  return () => {
    window.removeEventListener(CALL_EVENT, listener);
    voiceCallListenerCount = Math.max(0, voiceCallListenerCount - 1);
  };
}
