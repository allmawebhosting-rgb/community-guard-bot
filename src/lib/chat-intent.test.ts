import { describe, expect, it } from "vitest";
import {
  isReportingIntent,
  shouldLoadReportingPrompt,
  shouldShowDirectHelp,
} from "./chat-intent";

describe("direct help routing", () => {
  it("keeps a stolen-property report in the reporting flow even when police are mentioned", () => {
    const reporting = isReportingIntent({
      flowLabel: null,
      intakeText: "My phone was stolen and I want to report it to the police.",
    });

    expect(reporting).toBe(true);
    expect(shouldShowDirectHelp("police", reporting, null)).toBe(false);
  });

  it("recognizes an existing incident report flow", () => {
    expect(
      isReportingIntent({
        flowLabel: "Report an incident",
        intakeText: "Which area did it happen in?",
      }),
    ).toBe(true);
  });

  it("still finds a police station when no report or other flow is active", () => {
    const reporting = isReportingIntent({
      flowLabel: null,
      intakeText: "Where is the nearest police station?",
    });

    expect(reporting).toBe(false);
    expect(shouldShowDirectHelp("police", reporting, null)).toBe(true);
  });

  it("does not interrupt a different active flow with a facility search", () => {
    expect(shouldShowDirectHelp("hospital", false, "Missing person")).toBe(false);
  });

  it("leaves emergency facility routing to the emergency instructions", () => {
    expect(shouldShowDirectHelp("ambulance", false, null, true)).toBe(false);
  });

  it("allows the active help flow to search after a service is chosen", () => {
    expect(shouldShowDirectHelp("hospital", false, "Find help")).toBe(true);
  });

  it("does not load report instructions for an emergency-only request", () => {
    expect(
      shouldLoadReportingPrompt({
        isReportFlow: false,
        isReporting: false,
        intakeText: "There is a fire in the building",
      }),
    ).toBe(false);
  });

  it("loads report instructions when a report is actually requested", () => {
    expect(
      shouldLoadReportingPrompt({
        isReportFlow: false,
        isReporting: false,
        intakeText: "Please report the theft",
      }),
    ).toBe(true);
  });
});
