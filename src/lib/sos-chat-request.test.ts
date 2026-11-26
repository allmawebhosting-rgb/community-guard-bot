import { afterEach, describe, expect, it } from "vitest";
import { requestSosChatStartInPlace, SOS_CHAT_START_EVENT } from "./sos-chat-request";

describe("requestSosChatStartInPlace", () => {
  const listeners: Array<() => void> = [];
  afterEach(() => listeners.splice(0).forEach((off) => off()));

  it("reports not handled when no chat is open on the page", () => {
    expect(requestSosChatStartInPlace()).toBe(false);
  });

  it("reports handled when a mounted chat takes the request", () => {
    const onStart = (event: Event) => {
      (event as CustomEvent<{ handled: boolean }>).detail.handled = true;
    };
    window.addEventListener(SOS_CHAT_START_EVENT, onStart);
    listeners.push(() => window.removeEventListener(SOS_CHAT_START_EVENT, onStart));
    expect(requestSosChatStartInPlace()).toBe(true);
  });
});
