import type { SosRoomDetail, SosRoomParticipant } from "@/lib/sos-rooms";

export type ParticipantConnection = "connected" | "joined" | "disconnected";

export type ConversationParticipant = {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: "owner" | "responder" | "contact" | "ai";
  connection: ParticipantConnection;
};

const ALLMA_AI_ID = "allma-ai";

function normalizeConnection(value: unknown): ParticipantConnection {
  if (value === "connected" || value === "disconnected" || value === "joined") return value;
  return "joined";
}

function normalizeRole(value: unknown): ConversationParticipant["role"] {
  if (value === "owner" || value === "responder" || value === "contact" || value === "ai") {
    return value;
  }
  return "contact";
}

/** Messenger-style strip: person in danger, Allma AI, then every authorised human. */
export function buildSosParticipantStrip(
  room: SosRoomDetail | null,
  options?: { includeAi?: boolean },
): ConversationParticipant[] {
  const includeAi = options?.includeAi !== false;
  if (!room) {
    return includeAi
      ? [
          {
            id: ALLMA_AI_ID,
            name: "Allma AI",
            avatarUrl: null,
            role: "ai",
            connection: "joined",
          },
        ]
      : [];
  }

  const people: ConversationParticipant[] = [
    {
      id: room.owner_id,
      name: room.sender_name,
      avatarUrl: room.sender_avatar_url,
      role: "owner",
      connection: "joined",
    },
  ];

  if (includeAi) {
    people.push({
      id: ALLMA_AI_ID,
      name: "Allma AI",
      avatarUrl: null,
      role: "ai",
      connection: "joined",
    });
  }

  const seen = new Set(people.map((person) => person.id));
  for (const participant of room.participants) {
    if (!participant.user_id || seen.has(participant.user_id)) continue;
    seen.add(participant.user_id);
    people.push(mapRoomParticipant(participant));
  }
  return people;
}

export function mapRoomParticipant(participant: SosRoomParticipant): ConversationParticipant {
  return {
    id: participant.user_id,
    name: participant.name,
    avatarUrl: participant.avatar_url,
    role: normalizeRole(participant.role === "owner" ? "owner" : participant.role),
    connection: normalizeConnection(participant.connection_status),
  };
}

export function participantRoleLabel(role: ConversationParticipant["role"]) {
  switch (role) {
    case "owner":
      return "Needs help";
    case "ai":
      return "Allma AI";
    case "responder":
      return "Responder";
    default:
      return "Safety Network";
  }
}

export function participantConnectionLabel(connection: ParticipantConnection) {
  switch (connection) {
    case "connected":
      return "On call";
    case "disconnected":
      return "Disconnected";
    default:
      return "In chat";
  }
}

/** Only ACCEPTED (answered) invitees appear — ringing/declined/missed never join. */
export function isJoinedInvitationStatus(status: string | null | undefined) {
  return String(status ?? "").toUpperCase() === "ACCEPTED";
}
