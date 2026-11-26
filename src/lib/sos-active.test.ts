import { describe, expect, it } from "vitest";
import { clearActiveSos, markActiveSosEnded, setActiveSos, useActiveSos } from "@/lib/sos-active";
import { renderHook, act } from "@testing-library/react";

describe("active SOS header state", () => {
  it("keeps an ended SOS visible instead of clearing it", () => {
    const { result } = renderHook(() => useActiveSos());
    act(() => setActiveSos({ activityId: "a1", type: "medical" }));
    expect(result.current?.ended).toBeFalsy();
    act(() => markActiveSosEnded("a1", "medical"));
    expect(result.current?.ended).toBe(true);
    act(() => clearActiveSos("a1"));
    expect(result.current?.ended).toBe(true);
    act(() => setActiveSos(null));
    expect(result.current).toBeNull();
  });

  it("clears a live SOS", () => {
    const { result } = renderHook(() => useActiveSos());
    act(() => setActiveSos({ activityId: "a2", type: "medical" }));
    act(() => clearActiveSos("a2"));
    expect(result.current).toBeNull();
  });
});
