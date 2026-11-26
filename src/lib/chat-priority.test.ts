import { describe, expect, it } from "vitest";
import {
  CALM_LINE,
  LOCATION_ASK,
  classifySafety,
  contactsHospitals,
  continuedIncident,
  emergencyTurn,
  factsPromptBlock,
  limitChips,
  priorityPromptBlock,
  safetyPlanOf,
  sessionFacts,
} from "@/lib/chat-priority";

describe("classifySafety", () => {
  it.each([
    "boda boda accident in Jinja",
    "I am bleeding heavily",
    "my friend is unconscious",
    "help",
    "Help me!",
    "there is a fire in my house",
    "I was assaulted",
    "I need help now",
  ])("treats %j as an emergency", (text) => {
    expect(classifySafety(text).level).toBe("emergency");
  });

  it.each([
    "help me write an email to the clinic",
    "how do I treat a burn",
    "Book an appointment at Jinja hospital",
    "boda boda stage near me",
    "fire station near me",
    "I had an accident last year",
    "what is malaria?",
    "Write an email to my landlord",
  ])("does not treat %j as an emergency", (text) => {
    expect(classifySafety(text).level).not.toBe("emergency");
  });

  it.each(["I have a fever and a headache", "my nose is bleeding", "I have stomach pain"])(
    "treats %j as urgent health",
    (text) => {
      expect(classifySafety(text).level).toBe("urgent");
    },
  );

  it("treats a general question as normal", () => {
    expect(classifySafety("What are your opening hours?").level).toBe("normal");
  });

  it("keeps a bare town answer inside the emergency that asked for it", () => {
    const first = "boda boda accident, someone is hurt";
    const result = classifySafety("Jinja", {
      lastAssistantText: `${CALM_LINE}\n\n${LOCATION_ASK}`,
      priorUserTexts: [first],
    });
    expect(result.level).toBe("emergency");
    expect(result.reason).toBe("sticky");
    expect(result.reportText).toBe(first);
  });

  it("lets the user call it off", () => {
    const result = classifySafety("false alarm, I'm fine", {
      lastAssistantText: LOCATION_ASK,
      priorUserTexts: ["boda boda accident"],
    });
    expect(result.level).toBe("normal");
  });

  it("stays an emergency while SOS is active", () => {
    expect(classifySafety("is he still breathing", { sosActive: true }).level).toBe("emergency");
  });
});

describe("emergencyTurn", () => {
  const accident = classifySafety("boda boda accident in Jinja");

  it("asks one location question with a single chip when the place is unknown", () => {
    const turn = emergencyTurn(accident, { hasLocation: false });
    expect(turn.step).toBe("location");
    expect(turn.text.startsWith(CALM_LINE)).toBe(true);
    expect(turn.text.match(/\?/g)).toHaveLength(1);
    expect(turn.text).toContain("::suggest[Share my location]");
    expect(turn.text.match(/^\d\. /gm)!.length).toBeLessThanOrEqual(3);
  });

  it("goes straight to SOS then hospitals when the place is known", () => {
    const turn = emergencyTurn(accident, { hasLocation: true, place: "Jinja" });
    expect(turn.step).toBe("dispatch");
    expect(turn.hospitals).toBe(true);
    expect(turn.text).toContain("I have your location (Jinja)");
    expect(turn.text).toMatch(/Starting SOS.*then contacting the nearest hospitals/);
    expect(turn.text).not.toContain("?");
    expect(turn.text).not.toMatch(/book|appointment/i);
  });

  it("never repeats the location question after it was answered with an unknown place", () => {
    const sticky = classifySafety("Kakiribo corner", {
      lastAssistantText: LOCATION_ASK,
      priorUserTexts: ["boda boda accident"],
    });
    const turn = emergencyTurn(sticky, { hasLocation: false });
    expect(turn.step).toBe("dispatch");
    expect(turn.hospitals).toBe(false);
    expect(turn.text).not.toMatch(/which town/i);
    expect(turn.text).toContain("Starting SOS");
  });

  it("uses a generic opening and asks what happened for a bare help call", () => {
    const help = classifySafety("help");
    const turn = emergencyTurn(help, { hasLocation: true });
    expect(turn.hospitals).toBe(false);
    expect(turn.text).toContain("What happened?");
    expect(turn.text).toContain("::suggest[Accident | Fire | Someone attacked me]");
  });

  it("does not call hospitals for police-first emergencies", () => {
    const breakIn = classifySafety("someone is breaking into my house");
    expect(breakIn.level).toBe("emergency");
    expect(contactsHospitals(breakIn)).toBe(false);
  });
});

describe("session memory", () => {
  it("remembers the town, the situation and a typed name", () => {
    const facts = sessionFacts(["boda boda accident in Jinja", "my name is Sarah Namu"]);
    expect(facts.town).toBe("Jinja");
    expect(facts.name).toBe("Sarah Namu");
    expect(facts.whatHappened).toContain("boda boda accident");
    const block = factsPromptBlock(facts);
    expect(block).toContain("never ask again");
    expect(block).toContain("Jinja");
  });

  it("adds nothing when nothing is known", () => {
    expect(factsPromptBlock(sessionFacts(["hello"]))).toBe("");
  });
});

describe("limitChips", () => {
  it("caps at three and removes duplicates", () => {
    expect(limitChips(["a", "A", "b", "c", "d"], "normal")).toEqual(["a", "b", "c"]);
  });

  it("drops marketing and booking chips during an emergency", () => {
    expect(limitChips(["Book appointment", "Share my location", "Report a crime", "Yes"], "emergency")).toEqual([
      "Share my location",
      "Yes",
    ]);
  });

  it("keeps booking chips for urgent health", () => {
    expect(limitChips(["Book appointment", "Call clinic"], "urgent")).toEqual(["Book appointment", "Call clinic"]);
  });
});

describe("prompt blocks and plan part", () => {
  it("gives each level its own order", () => {
    expect(priorityPromptBlock("emergency")).toContain("Stay calm, help is coming.");
    expect(priorityPromptBlock("urgent")).toContain("Book appointment");
    expect(priorityPromptBlock("normal")).toContain("ONE relevant action card");
  });

  it("reads the plan back from message parts", () => {
    expect(
      safetyPlanOf([{ type: "data-safety-plan", data: { level: "emergency", step: "dispatch", sosType: "medical" } }]),
    ).toEqual({ level: "emergency", step: "dispatch", sosType: "medical" });
    expect(safetyPlanOf([{ type: "text" }])).toBeNull();
  });
});

describe("follow-up answers stay inside their incident", () => {
  const ask = "Did the bleeding stop?";
  it("keeps a nosebleed a nosebleed when the user says 'No, still bleeding'", () => {
    const a = classifySafety("No, still bleeding", {
      lastAssistantText: `1. Sit up\n${ask}`,
      priorUserTexts: ["hi", "my nose is bleeding"],
    });
    expect(a.level).toBe("urgent");
    expect(a.incident?.id).toBe("nosebleed");
    expect(a.reason).toBe("followup");
  });
  it("does not continue after a long unrelated message", () => {
    expect(
      continuedIncident("Please write an email to my landlord about the broken window and the rent", ask, ["my nose is bleeding"]),
    ).toBeNull();
  });
  it("does not continue when the follow-up question was not asked", () => {
    expect(continuedIncident("No, still bleeding", "Hello there", ["my nose is bleeding"])).toBeNull();
  });
});
