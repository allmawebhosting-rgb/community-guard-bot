import { describe, expect, it } from "vitest";
import {
  buildEmailSenderContext,
  composeEmailDraft,
  emailFactsBlock,
  finalizeModelDraft,
} from "./email-draft-compose";
import { findPlaceholders, hasPlaceholders, splitPlaceholders } from "./email-placeholders";

const profile = { full_name: "Allan Mawerere", phone: "0700 111 222", phone_e164: "+256700111222" };

describe("placeholders", () => {
  it("finds bracketed template parts but not ordinary brackets", () => {
    expect(findPlaceholders("Hi [Patient Name], see [1] and [Callback Number] or [...]")).toEqual([
      "[Patient Name]",
      "[Callback Number]",
      "[...]",
    ]);
    expect(hasPlaceholders("All good", "Nothing to fill [2]")).toBe(false);
    expect(hasPlaceholders("", "Call [Phone]")).toBe(true);
  });
  it("splits text into plain and placeholder segments", () => {
    expect(splitPlaceholders("a [B] c")).toEqual([
      { text: "a ", placeholder: false },
      { text: "[B]", placeholder: true },
      { text: " c", placeholder: false },
    ]);
  });
});

describe("buildEmailSenderContext", () => {
  it("collects name, phone, gmail, town and what happened without inventing anything", () => {
    const ctx = buildEmailSenderContext({
      profile,
      gmail: "airpreaching@gmail.com",
      userTexts: ["I was in a boda boda accident and my leg is bleeding", "I am in Jinja", "Write an email to a nearby hospital"],
    });
    expect(ctx).toMatchObject({
      name: "Allan Mawerere",
      phone: "+256700111222",
      gmail: "airpreaching@gmail.com",
      place: "Jinja",
      location: "in Jinja",
      mapLink: null,
    });
    expect(ctx.situation).toContain("boda boda accident");
  });

  it("uses a shared GPS fix as a nearby town plus a map link", () => {
    const ctx = buildEmailSenderContext({
      profile: null,
      userTexts: ["Write an email to a nearby hospital"],
      coords: { latitude: 0.4244, longitude: 33.2041 },
    });
    expect(ctx.name).toBeNull();
    expect(ctx.phone).toBeNull();
    expect(ctx.location).toMatch(/^near /);
    expect(ctx.mapLink).toBe("https://www.google.com/maps?q=0.424400,33.204100");
  });

  it("does not take the town in an email ask as the user's location", () => {
    const ctx = buildEmailSenderContext({ profile, userTexts: ["Write an email to Jinja hospital"] });
    expect(ctx.location).toBeNull();
  });

  it("knows nothing when there is nothing to know", () => {
    const ctx = buildEmailSenderContext({ profile: null, userTexts: ["Write an email"] });
    expect(ctx).toMatchObject({ name: null, phone: null, gmail: null, place: null, situation: null });
    expect(emailFactsBlock(ctx)).toContain("nothing known");
  });
});

describe("composeEmailDraft", () => {
  const known = buildEmailSenderContext({
    profile,
    gmail: "airpreaching@gmail.com",
    userTexts: ["I am in Jinja", "Write an email to a nearby hospital asking about an appointment"],
  });

  it("writes a short specific subject and a placeholder-free body from known facts", () => {
    const draft = composeEmailDraft(known, { askText: "Write an email to a nearby hospital asking about an appointment" });
    expect(draft.subject).toBe("Appointment request – Allan Mawerere");
    expect(draft.body).toContain("I would like to ask about appointment availability.");
    expect(draft.body).toContain("+256700111222");
    expect(draft.body).toContain("in Jinja");
    expect(draft.to).toBeNull();
    expect(draft.placeholders).toEqual([]);
    expect(hasPlaceholders(draft.subject, draft.body)).toBe(false);
  });

  it("leaves unknown details out instead of writing placeholders", () => {
    const empty = buildEmailSenderContext({ profile: null, userTexts: ["Write an email to a nearby hospital"] });
    const draft = composeEmailDraft(empty, { askText: "Write an email to a nearby hospital" });
    expect(draft.subject).toBe("Request for medical help");
    expect(hasPlaceholders(draft.subject, draft.body)).toBe(false);
    expect(draft.body).not.toMatch(/phone|\[/i);
  });

  it("keeps the address the user typed", () => {
    const draft = composeEmailDraft(known, { askText: "Write an email to allmawebhosting@gmail.com about my invoice" });
    expect(draft.to).toBe("allmawebhosting@gmail.com");
    expect(draft.subject).toBe("My invoice");
  });
});

describe("finalizeModelDraft", () => {
  const ctx = buildEmailSenderContext({
    profile,
    gmail: "airpreaching@gmail.com",
    userTexts: ["I was in a boda boda accident and my leg is bleeding", "I am in Jinja", "Write an email to a nearby hospital"],
  });

  it("fills known details into the model's placeholders", () => {
    const draft = finalizeModelDraft(
      {
        subject: "[Patient Name] - Medical Assistance Needed",
        body: "Dear Sir or Madam,\n\n[Patient Name] is experiencing [Symptoms] and is located at [Location]. Please call [Callback Number].\n\nSincerely,\n[User Name]",
      },
      ctx,
      { askText: "Write an email to a nearby hospital", to: null },
    );
    expect(draft.subject).toBe("Allan Mawerere - Medical Assistance Needed");
    expect(draft.body).toContain("Allan Mawerere is experiencing I was in a boda boda accident and my leg is bleeding");
    expect(draft.body).toContain("located at Jinja");
    expect(draft.body).toContain("+256700111222");
    expect(draft.body.trim().endsWith("Allan Mawerere")).toBe(true);
    expect(draft.placeholders).toEqual([]);
  });

  it("drops what it cannot fill instead of leaving brackets", () => {
    const bare = buildEmailSenderContext({ profile: null, userTexts: ["Write an email to a nearby hospital"] });
    const draft = finalizeModelDraft(
      {
        subject: "[Patient Name] - Medical Assistance Needed",
        body: "Dear [Hospital Name],\n\nI need help at the hospital. The patient is [Age] years old. Please call me back soon.\n\nSincerely,\n[User Name]",
      },
      bare,
      { askText: "Write an email to a nearby hospital", to: null },
    );
    expect(draft.subject).toBe("Request for medical help");
    expect(draft.body).toContain("I need help at the hospital.");
    expect(draft.body).toContain("Please call me back soon.");
    expect(draft.body).not.toContain("years old");
    expect(draft.body).not.toContain("[");
    expect(draft.body.startsWith("Hello,")).toBe(true);
    expect(draft.body).not.toMatch(/Sincerely/);
    expect(draft.body.trim().endsWith("Thank you.")).toBe(true);
    expect(draft.placeholders).toEqual([]);
  });

  it("falls back to the known-facts draft when nothing usable is left", () => {
    const draft = finalizeModelDraft({ subject: "Hi", body: "[Everything]" }, ctx, {
      askText: "Write an email to a nearby hospital",
      to: null,
    });
    expect(draft.body).toContain("Allan Mawerere");
    expect(draft.placeholders).toEqual([]);
  });

  it("never lets the model set the recipient address", () => {
    const draft = finalizeModelDraft(
      { subject: "Appointment request", body: "Hello,\n\nI would like to ask about appointment availability.\n\nThank you." },
      ctx,
      { askText: "Write an email to a nearby hospital", to: null },
    );
    expect(draft.to).toBeNull();
  });
});
