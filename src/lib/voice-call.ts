import { supabase } from "@/integrations/supabase/client";

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

export type CallPeer = { id: string; name: string; avatarUrl?: string | null };

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
  /** True when a TURN relay credential was issued for this call. */
  onRelay?: (relay: boolean) => void;
};

/**
 * Real peer-to-peer WebRTC audio. Signalling (SDP + ICE) travels through the
 * RLS-protected `call_signals` table over Supabase realtime, so only the two
 * call participants can read or write it.
 */
export class VoiceCallEngine {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private remoteReady = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private closed = false;
  private restarted = false;

  constructor(
    private readonly callId: string,
    private readonly userId: string,
    private readonly isCaller: boolean,
    private readonly events: EngineEvents,
  ) {}

  async start() {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    const ice = await fetchIceConfig(this.callId);
    this.events.onRelay?.(ice.relay);

    const pc = new RTCPeerConnection({ iceServers: ice.iceServers });
    this.pc = pc;
    this.localStream.getTracks().forEach((track) => pc.addTrack(track, this.localStream!));

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      if (!this.audioEl) {
        this.audioEl = document.createElement("audio");
        this.audioEl.autoplay = true;
        this.audioEl.setAttribute("aria-hidden", "true");
        document.body.appendChild(this.audioEl);
      }
      this.audioEl.srcObject = stream;
      void this.audioEl.play().catch(() => undefined);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) void this.send("candidate", event.candidate.toJSON());
    };

    pc.onconnectionstatechange = () => {
      if (this.closed) return;
      switch (pc.connectionState) {
        case "connected":
          this.events.onQuality("good");
          this.events.onConnected();
          break;
        case "disconnected":
          this.events.onQuality("reconnecting");
          break;
        case "failed":
          this.events.onFailed("The connection dropped. Please try calling again.");
          break;
        default:
          break;
      }
    };

    await this.subscribe();
    await this.drainExistingSignals();

    if (this.isCaller) {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      await this.send("offer", { sdp: offer.sdp });
    }
  }

  setMuted(muted: boolean) {
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  async setSpeaker(on: boolean) {
    const el = this.audioEl as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el?.setSinkId) return false;
    try {
      await el.setSinkId(on ? "default" : "");
      return true;
    } catch {
      return false;
    }
  }

  close() {
    this.closed = true;
    if (this.channel) void supabase.removeChannel(this.channel);
    this.channel = null;
    this.pc?.close();
    this.pc = null;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    if (this.audioEl) {
      this.audioEl.srcObject = null;
      this.audioEl.remove();
      this.audioEl = null;
    }
  }

  private async send(kind: "offer" | "answer" | "candidate" | "bye", payload: unknown) {
    if (this.closed) return;
    await supabase.from("call_signals").insert({
      call_id: this.callId,
      sender_id: this.userId,
      kind,
      payload: payload as never,
    });
  }

  private async subscribe() {
    this.channel = supabase
      .channel(`call-signals-${this.callId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "call_signals",
          filter: `call_id=eq.${this.callId}`,
        },
        (payload) => {
          void this.handleSignal(payload.new as {
            sender_id: string;
            kind: string;
            payload: Record<string, unknown>;
          });
        },
      )
      .subscribe();
  }

  private async drainExistingSignals() {
    const { data } = await supabase
      .from("call_signals")
      .select("sender_id, kind, payload")
      .eq("call_id", this.callId)
      .order("created_at", { ascending: true });
    for (const signal of data ?? []) {
      await this.handleSignal(
        signal as { sender_id: string; kind: string; payload: Record<string, unknown> },
      );
    }
  }

  private async handleSignal(signal: {
    sender_id: string;
    kind: string;
    payload: Record<string, unknown>;
  }) {
    if (this.closed || !this.pc || signal.sender_id === this.userId) return;
    try {
      if (signal.kind === "offer" && !this.isCaller) {
        if (this.remoteReady) return;
        await this.pc.setRemoteDescription({
          type: "offer",
          sdp: String(signal.payload["sdp"] ?? ""),
        });
        this.remoteReady = true;
        await this.flushCandidates();
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await this.send("answer", { sdp: answer.sdp });
      } else if (signal.kind === "answer" && this.isCaller) {
        if (this.remoteReady) return;
        await this.pc.setRemoteDescription({
          type: "answer",
          sdp: String(signal.payload["sdp"] ?? ""),
        });
        this.remoteReady = true;
        await this.flushCandidates();
      } else if (signal.kind === "candidate") {
        const candidate = signal.payload as RTCIceCandidateInit;
        if (!this.remoteReady) this.pendingCandidates.push(candidate);
        else await this.pc.addIceCandidate(candidate);
      }
    } catch {
      // A malformed or duplicated signal must not tear down a live call.
    }
  }

  private async flushCandidates() {
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) {
      try {
        await this.pc?.addIceCandidate(candidate);
      } catch {
        // ignore stale candidates
      }
    }
  }
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
