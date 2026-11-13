import { describe, expect, it } from "vitest";
import {
  assistantHasVisibleText,
  chatProgressSteps,
  findFacilitiesProgress,
  isChatProgressStepId,
  progressStepsFromParts,
} from "./chat-progress";

describe("chat progress checklist", () => {
  it("shows understanding while the request is submitted", () => {
    const steps = chatProgressSteps({ status: "submitted", hasVisibleText: false });
    expect(steps?.map((s) => s.id)).toEqual(["understanding", "writing"]);
    expect(steps?.map((s) => s.state)).toEqual(["active", "pending"]);
  });

  it("moves to writing once the stream starts and no search is running", () => {
    const steps = chatProgressSteps({ status: "streaming", hasVisibleText: false });
    expect(steps?.map((s) => [s.id, s.state])).toEqual([
      ["understanding", "done"],
      ["writing", "active"],
    ]);
  });

  it("adds finding help only when a facility search runs", () => {
    const steps = chatProgressSteps({
      status: "streaming",
      hasVisibleText: false,
      findFacilities: "running",
    });
    expect(steps?.map((s) => [s.id, s.state])).toEqual([
      ["understanding", "done"],
      ["finding", "active"],
      ["writing", "pending"],
    ]);
  });

  it("adds checking phone numbers only when the server reports it", () => {
    const steps = chatProgressSteps({
      status: "streaming",
      hasVisibleText: false,
      serverSteps: ["understanding", "finding", "phones"],
      findFacilities: "running",
    });
    expect(steps?.map((s) => [s.id, s.state])).toEqual([
      ["understanding", "done"],
      ["finding", "done"],
      ["phones", "active"],
      ["writing", "pending"],
    ]);
  });

  it("ticks earlier steps off when the places tool finishes", () => {
    const steps = chatProgressSteps({
      status: "streaming",
      hasVisibleText: false,
      serverSteps: ["understanding", "finding", "phones"],
      findFacilities: "done",
    });
    expect(steps?.map((s) => [s.id, s.state])).toEqual([
      ["understanding", "done"],
      ["finding", "done"],
      ["phones", "done"],
      ["writing", "active"],
    ]);
  });

  it("hides the checklist once assistant text starts arriving", () => {
    expect(
      chatProgressSteps({
        status: "streaming",
        hasVisibleText: true,
        findFacilities: "done",
        serverSteps: ["writing"],
      }),
    ).toBeNull();
  });

  it("hides the checklist when the reply is finished", () => {
    expect(chatProgressSteps({ status: "ready", hasVisibleText: false })).toBeNull();
  });

  it("reads server progress events and tool state from parts", () => {
    expect(isChatProgressStepId("phones")).toBe(true);
    expect(isChatProgressStepId("other")).toBe(false);
    expect(
      progressStepsFromParts([
        { type: "data-chat-progress", data: { step: "finding" } },
        { type: "data-chat-progress", data: { step: "finding" } },
        { type: "data-chat-progress", data: { step: "phones" } },
        { type: "text", data: { step: "writing" } },
      ]),
    ).toEqual(["finding", "phones"]);
    expect(findFacilitiesProgress([{ type: "tool-find_facilities", state: "input-available" }])).toBe("running");
    expect(findFacilitiesProgress([{ type: "tool-find_facilities", state: "output-available" }])).toBe("done");
    expect(findFacilitiesProgress([])).toBe("none");
    expect(assistantHasVisibleText([{ type: "text", text: "  " }])).toBe(false);
    expect(assistantHasVisibleText([{ type: "text", text: "Sit up and lean forward." }])).toBe(true);
  });
});
