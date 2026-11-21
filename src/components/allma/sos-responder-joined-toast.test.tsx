import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useResponderJoinedNotifications } from "./sos-responder-joined-toast";
import type { ConversationParticipant } from "@/lib/sos-participants";

const owner: ConversationParticipant = {
  id: "owner-1",
  name: "Air",
  avatarUrl: null,
  role: "owner",
  connection: "joined",
};

const sarah: ConversationParticipant = {
  id: "sarah-1",
  name: "Sarah",
  avatarUrl: null,
  role: "responder",
  connection: "joined",
};

describe("useResponderJoinedNotifications", () => {
  it("does not toast participants already present on first snapshot", () => {
    const { result } = renderHook(() =>
      useResponderJoinedNotifications({
        enabled: true,
        isOwner: true,
        ownerId: owner.id,
        participants: [owner, sarah],
      }),
    );
    expect(result.current.current).toBeNull();
  });

  it("toasts a newly accepted responder once", () => {
    const highlights: string[] = [];
    const { result, rerender } = renderHook(
      ({ people }) =>
        useResponderJoinedNotifications({
          enabled: true,
          isOwner: true,
          ownerId: owner.id,
          participants: people,
          onHighlight: (id) => highlights.push(id),
        }),
      { initialProps: { people: [owner] as ConversationParticipant[] } },
    );

    expect(result.current.current).toBeNull();

    act(() => {
      rerender({ people: [owner, sarah] });
    });

    expect(result.current.current?.id).toBe("sarah-1");
    expect(highlights).toEqual(["sarah-1"]);

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.current).toBeNull();

    act(() => {
      rerender({ people: [owner, sarah] });
    });
    expect(result.current.current).toBeNull();
  });
});
