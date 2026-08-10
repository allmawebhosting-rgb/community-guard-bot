export type VoiceProviderMode = "demo" | "webrtc";

export type VoiceSession = {
  provider: VoiceProviderMode;
  status: "connecting" | "ringing" | "connected" | "reconnecting" | "ended";
  sessionId: string | null;
};

/**
 * Integration boundary for a real voice provider.
 *
 * Demo mode intentionally never opens a microphone, creates a peer connection,
 * or claims that a call reached another person. A WebRTC provider can replace
 * this adapter after authenticated short-lived tokens and TURN credentials are
 * issued by the server.
 */
export interface VoiceProvider {
  startCall(input: { callId: string; recipientId: string }): Promise<VoiceSession>;
  acceptCall(input: { callId: string }): Promise<VoiceSession>;
  endCall(input: { callId: string }): Promise<void>;
}

export const demoVoiceProvider: VoiceProvider = {
  async startCall() {
    return { provider: "demo", status: "ringing", sessionId: null };
  },
  async acceptCall() {
    return { provider: "demo", status: "connected", sessionId: null };
  },
  async endCall() {},
};
