import { supabase } from "@/integrations/supabase/client";

export type VoiceProviderMode = "demo" | "webrtc";

export type VoiceSessionStatus =
  "connecting" | "ringing" | "connected" | "reconnecting" | "ended" | "failed";

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type VoiceSession = {
  provider: VoiceProviderMode;
  status: VoiceSessionStatus;
  sessionId: string | null;
  /** Short-lived provider token; never persist this in the database. */
  token?: string;
  expiresAt?: string;
  iceServers?: IceServer[];
  signalUrl?: string;
  /** This is true only when the server has confirmed the provider state. */
  providerConfirmed: boolean;
};

export type VoiceSessionListener = (session: VoiceSession) => void;

export interface VoiceProvider {
  startCall(input: { callId: string; recipientId: string }): Promise<VoiceSession>;
  acceptCall(input: { callId: string }): Promise<VoiceSession>;
  endCall(input: { callId: string }): Promise<void>;
  setMuted(muted: boolean): void;
  subscribe(listener: VoiceSessionListener): () => void;
}

export class VoiceProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "VoiceProviderError";
  }
}

type VoiceAction = "start" | "accept" | "end";

type VoiceApiResponse = {
  session?: VoiceSession;
  providerConfirmed?: boolean;
  error?: string;
};

function isBrowser() {
  return typeof window !== "undefined";
}

/**
 * Authenticated WebRTC adapter.
 *
 * The browser only receives a provider-issued, short-lived session token. The
 * provider API key, participant checks, call state writes, and provider state
 * confirmation all happen in /api/voice.
 */
class AuthenticatedWebRtcVoiceProvider implements VoiceProvider {
  private session: VoiceSession | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private signalSocket: WebSocket | null = null;
  private listeners = new Set<VoiceSessionListener>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private callId: string | null = null;
  private muted = false;

  async startCall(input: { callId: string; recipientId: string }) {
    return this.begin("start", input.callId, input.recipientId);
  }

  async acceptCall(input: { callId: string }) {
    return this.begin("accept", input.callId);
  }

  private async begin(action: Exclude<VoiceAction, "end">, callId: string, recipientId?: string) {
    this.callId = callId;
    const response = await this.request(action, { callId, recipientId });
    if (!response.session)
      throw new VoiceProviderError(response.error ?? "Voice session was not created.");

    this.setSession(response.session);
    this.startStatePolling();

    // A managed provider may not expose browser signalling. In that case its
    // server confirmation remains the sole source of truth.
    if (response.session.signalUrl && response.session.sessionId) {
      await this.openWebRtcTransport(response.session);
    }

    return this.session!;
  }

  async endCall(input: { callId: string }) {
    this.stopPolling();
    this.clearReconnectTimer();
    await this.request("end", {
      callId: input.callId,
      sessionId: this.session?.sessionId ?? undefined,
    });
    this.closeTransport();
    this.setSession({
      provider: this.session?.provider ?? "webrtc",
      status: "ended",
      sessionId: this.session?.sessionId ?? null,
      providerConfirmed: false,
    });
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  subscribe(listener: VoiceSessionListener) {
    this.listeners.add(listener);
    if (this.session) listener(this.session);
    return () => this.listeners.delete(listener);
  }

  private async request(action: VoiceAction, body: Record<string, string | undefined>) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) {
      throw new VoiceProviderError("Sign in is required before starting an emergency call.", 401);
    }

    const response = await fetch("/api/voice", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({ action, ...body }),
    });
    const payload = (await response.json().catch(() => ({}))) as VoiceApiResponse;
    if (!response.ok) {
      throw new VoiceProviderError(
        payload.error ?? "The voice provider is not available.",
        response.status,
      );
    }
    return payload;
  }

  private setSession(session: VoiceSession) {
    this.session = {
      ...session,
      providerConfirmed: session.status === "connected" && session.providerConfirmed === true,
    };
    this.listeners.forEach((listener) => listener(this.session!));
  }

  private startStatePolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      void this.refreshState();
    }, 2000);
  }

  private stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async refreshState() {
    if (!this.callId || !this.session?.sessionId) return;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const response = await fetch(
        `/api/voice?callId=${encodeURIComponent(this.callId)}&sessionId=${encodeURIComponent(this.session.sessionId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) return;
      const payload = (await response.json()) as VoiceApiResponse;
      if (payload.session) {
        this.setSession(payload.session);
        if (payload.session.status === "ended" || payload.session.status === "failed") {
          this.stopPolling();
          this.closeTransport();
        }
      }
    } catch {
      // A transient polling failure must not turn an unconfirmed call into a
      // connected one. The next poll retries and the transport handles media.
    }
  }

  private async openWebRtcTransport(session: VoiceSession) {
    if (!isBrowser() || !session.signalUrl || !session.sessionId) return;
    if (!("RTCPeerConnection" in window) || !navigator.mediaDevices?.getUserMedia) {
      throw new VoiceProviderError("This browser does not support secure in-app voice.", 501);
    }

    this.closeTransport();
    this.setSession({ ...session, status: "connecting", providerConfirmed: false });
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.localStream.getAudioTracks().forEach((track) => (track.enabled = !this.muted));
    const peerConnection = new RTCPeerConnection({ iceServers: session.iceServers ?? [] });
    this.peerConnection = peerConnection;
    this.localStream
      .getTracks()
      .forEach((track) => peerConnection.addTrack(track, this.localStream!));
    peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream || !isBrowser()) return;
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("aria-hidden", "true");
      audio.srcObject = remoteStream;
      void audio.play().catch(() => {
        // The provider reconnect path retries playback if the browser blocks
        // audio after the initial user gesture.
      });
    };
    peerConnection.onconnectionstatechange = () => {
      if (
        peerConnection.connectionState === "failed" ||
        peerConnection.connectionState === "disconnected"
      ) {
        this.scheduleReconnect();
      }
    };

    const socket = new WebSocket(session.signalUrl);
    this.signalSocket = socket;
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socketIsOpen(this.signalSocket)) {
        this.signalSocket.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
      }
    };
    socket.onopen = async () => {
      socket.send(JSON.stringify({ type: "authenticate", token: session.token }));
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.send(JSON.stringify({ type: "offer", sdp: offer.sdp }));
    };
    socket.onmessage = (event) => {
      void this.handleSignalMessage(event.data);
    };
    socket.onerror = () => this.scheduleReconnect();
    socket.onclose = () => {
      if (this.session?.status !== "ended") this.scheduleReconnect();
    };
  }

  private async handleSignalMessage(raw: string) {
    if (!this.peerConnection) return;
    let message: { type?: string; sdp?: string; candidate?: RTCIceCandidateInit } = {};
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message.type === "answer" && message.sdp) {
      await this.peerConnection.setRemoteDescription({ type: "answer", sdp: message.sdp });
    } else if (message.type === "candidate" && message.candidate) {
      await this.peerConnection.addIceCandidate(message.candidate);
    }
  }

  private scheduleReconnect() {
    if (!this.session || this.session.status === "ended" || this.reconnectTimer) return;
    this.setSession({ ...this.session, status: "reconnecting", providerConfirmed: false });
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 15_000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.session)
        void this.openWebRtcTransport(this.session).catch(() => this.scheduleReconnect());
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private closeTransport() {
    this.signalSocket?.close();
    this.signalSocket = null;
    this.peerConnection?.close();
    this.peerConnection = null;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
  }
}

function socketIsOpen(socket: WebSocket | null): socket is WebSocket {
  return socket?.readyState === WebSocket.OPEN;
}

/** The only production adapter exported to the app. */
export const voiceProvider: VoiceProvider = new AuthenticatedWebRtcVoiceProvider();

/**
 * Explicitly non-production behavior retained for previews and local demos.
 * It can never report a connected call.
 */
export const demoVoiceProvider: VoiceProvider = {
  async startCall() {
    return { provider: "demo", status: "ringing", sessionId: null, providerConfirmed: false };
  },
  async acceptCall() {
    return { provider: "demo", status: "ringing", sessionId: null, providerConfirmed: false };
  },
  async endCall() {},
  setMuted() {},
  subscribe() {
    return () => {};
  },
};
