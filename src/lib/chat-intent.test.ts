import { describe, expect, it } from "vitest";
import {
  canUseCaseTimelineTool,
  canUseFilingTools,
  isFirstAidTopicAsk,
  isReportingIntent,
  isSoftGuidedFlow,
  nearbyHelpTypesForTurn,
  scriptedFlowOpener,
  shouldLoadReportingPrompt,
  shouldShowDirectHelp,
} from "./chat-intent";
import { matchIncident } from "./allma-emergency-playbook";

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

  it("lets hospital search interrupt a soft Safety check flow", () => {
    expect(shouldShowDirectHelp("hospital", false, "Safety check")).toBe(true);
    expect(shouldShowDirectHelp("police", false, "Advice")).toBe(true);
    expect(isSoftGuidedFlow("Safety check")).toBe(true);
    expect(isSoftGuidedFlow("Reporting")).toBe(false);
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

  it("always returns playbook facilities for a non-reporting emergency", () => {
    expect(
      nearbyHelpTypesForTurn({
        directFacilityTypes: [],
        directService: null,
        emergencyHelpTypes: ["hospital"],
        isReporting: false,
        showDirectHelp: false,
      }),
    ).toEqual(["hospital"]);
  });

  it("prefers an explicit hospital ask over emergency defaults", () => {
    expect(
      nearbyHelpTypesForTurn({
        directFacilityTypes: ["hospital"],
        directService: "hospital",
        emergencyHelpTypes: ["police"],
        isReporting: false,
        showDirectHelp: true,
      }),
    ).toEqual(["hospital"]);
  });

  it("does not force nearby help during a normal report", () => {
    expect(
      nearbyHelpTypesForTurn({
        directFacilityTypes: [],
        directService: null,
        emergencyHelpTypes: ["hospital"],
        isReporting: true,
        showDirectHelp: false,
      }),
    ).toEqual([]);
  });

  it("keeps filing tools locked until the report flow has real steps", () => {
    expect(canUseFilingTools({ flowLabel: null, step: 0, askedTitles: [] })).toBe(false);
    expect(canUseFilingTools({ flowLabel: "Reporting", step: 1, askedTitles: ["what kind"] })).toBe(false);
    expect(
      canUseFilingTools({
        flowLabel: "Reporting",
        step: 3,
        askedTitles: ["what kind", "where", "when"],
      }),
    ).toBe(true);
  });

  it("scripts a Reporting opener for crime-report chips without calling tools", () => {
    const reply = scriptedFlowOpener("I want to report a crime.", null);
    expect(reply).toMatch(/::flow\{type=Reporting/);
    expect(reply).toMatch(/::suggest\[Theft/);
    expect(scriptedFlowOpener("Report a crime", null)).toMatch(/::flow\{type=Reporting/);
    expect(scriptedFlowOpener("I want to report a crime.", "Reporting")).toBeNull();
  });

  it("scripts emergency numbers for natural phrasing and never uses alert tools", () => {
    expect(scriptedFlowOpener("Show me the emergency numbers", null)).toMatch(/Police 999/);
    expect(scriptedFlowOpener("Show me the emergency numbers", "Reporting")).toMatch(/Toll-free emergency 112/);
    expect(scriptedFlowOpener("Emergency numbers", null)).toMatch(/Police 999/);
  });

  it("scripts a first-aid clarification opener without Case Timeline", () => {
    expect(isFirstAidTopicAsk("Show first aid.")).toBe(true);
    expect(isFirstAidTopicAsk("I have cut my hand.")).toBe(false);
    const reply = scriptedFlowOpener("Show first aid.", null);
    expect(reply).toMatch(/first aid/i);
    expect(reply).toMatch(/What happened/i);
    expect(reply).not.toMatch(/Case Timeline|case_timeline/i);
  });

  it("keeps Case Timeline locked until a report has real steps", () => {
    expect(
      canUseCaseTimelineTool({ flowLabel: null, step: 0, intakeText: "Show first aid." }),
    ).toBe(false);
    expect(
      canUseCaseTimelineTool({ flowLabel: "Reporting", step: 1, intakeText: "Theft" }),
    ).toBe(false);
    expect(
      canUseCaseTimelineTool({ flowLabel: "Reporting", step: 3, intakeText: "Near the market" }),
    ).toBe(true);
  });

  it("matches cut-hand injuries for the bleeding playbook", () => {
    expect(matchIncident("I have cut my hand.")?.id).toBe("bleeding");
    expect(matchIncident("How do I stop the bleeding?")?.id).toBe("bleeding");
    expect(matchIncident("What should I do if someone is unconscious?")?.id).toBe("unconscious");
  });
});
