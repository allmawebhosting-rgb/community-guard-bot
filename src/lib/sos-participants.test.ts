import { describe, expect, it } from "vitest";
import {
  buildSosParticipantStrip,
  isJoinedInvitationStatus,
  mapRoomParticipant,
  participantConnectionLabel,
  participantRoleLabel,
} from "./sos-participants";
import type { SosRoomDetail } from "./sos-rooms";

const room: SosRoomDetail = {
  sos_activity_id: "sos-1",
  owner_id: "owner-1",
  sender_name: "Alex NeedsHelp",
  sender_avatar_url: "https://example.com/alex.jpg",
  emergency_type: "medical",
  severity: "critical",
  area: "Nairobi",
  created_at: "2026-01-01T00:00:00Z",
  is_mine: true,
  location_shared: true,
  latitude: -1.29,
  longitude: 36.82,
  accuracy_m: 12,
  participants: [
    {
      user_id: "responder-1",
      name: "Sam Responder",
      avatar_url: "https://example.com/sam.jpg",
      role: "contact",
      connection_status: "connected",
    },
    {
      user_id: "responder-2",
      name: "Jordan Helper",
      avatar_url: null,
      role: "responder",
      connection_status: "disconnected",
    },
  ],
};

describe("sos participants", () => {
  it("builds a Messenger-style strip with owner, Allma AI, then responders", () => {
    const strip = buildSosParticipantStrip(room);
    expect(strip.map((person) => person.id)).toEqual([
      "owner-1",
      "allma-ai",
      "responder-1",
      "responder-2",
    ]);
    expect(strip[0]).toMatchObject({ role: "owner", name: "Alex NeedsHelp" });
    expect(strip[1]).toMatchObject({ role: "ai", name: "Allma AI" });
    expect(strip[2].connection).toBe("connected");
    expect(strip[3].connection).toBe("disconnected");
  });

  it("dedupes participants and keeps Allma AI even when room is still loading", () => {
    expect(buildSosParticipantStrip(null).map((person) => person.role)).toEqual(["ai"]);
    const duplicateOwner = buildSosParticipantStrip({
      ...room,
      participants: [
        ...room.participants,
        {
          user_id: "owner-1",
          name: "Alex again",
          avatar_url: null,
          role: "contact",
          connection_status: "joined",
        },
      ],
    });
    expect(duplicateOwner.filter((person) => person.id === "owner-1")).toHaveLength(1);
  });

  it("only treats ACCEPTED invitations as joined participants", () => {
    expect(isJoinedInvitationStatus("ACCEPTED")).toBe(true);
    expect(isJoinedInvitationStatus("accepted")).toBe(true);
    expect(isJoinedInvitationStatus("PENDING")).toBe(false);
    expect(isJoinedInvitationStatus("SENT")).toBe(false);
    expect(isJoinedInvitationStatus("DECLINED")).toBe(false);
    expect(isJoinedInvitationStatus("CANCELLED")).toBe(false);
    expect(isJoinedInvitationStatus(null)).toBe(false);
  });

  it("maps room rows and labels connection states", () => {
    expect(mapRoomParticipant(room.participants[0])).toMatchObject({
      id: "responder-1",
      connection: "connected",
      role: "contact",
    });
    expect(participantRoleLabel("ai")).toBe("Allma AI");
    expect(participantRoleLabel("owner")).toBe("Needs help");
    expect(participantConnectionLabel("connected")).toBe("On call");
    expect(participantConnectionLabel("disconnected")).toBe("Disconnected");
  });
});
