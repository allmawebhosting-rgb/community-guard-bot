import { describe, expect, it } from "vitest";
import { buildIncidentEmailHtml, sendIncidentEmail } from "./agent-email.server";

describe("agent incident email", () => {
  it("builds HTML handoff with triage and actions", () => {
    const html = buildIncidentEmailHtml(
      {
        to: "clinic@example.com",
        subject: "Medical handoff — Allan",
        incidentType: "medical",
        patientOrReporterName: "Allan",
        locationSummary: "Bukoto near Kadic Hospital",
        triageSummary: "Nose swelling and trouble breathing after a fall",
        actionsTaken: ["Called Safety Network", "Kept airway clear"],
        status: "active",
        coordinates: { lat: 0.347, lng: 32.582 },
      },
      "2026-11-25T12:00:00.000Z",
    );
    expect(html).toMatch(/Allan/);
    expect(html).toMatch(/trouble breathing/i);
    expect(html).toMatch(/Called Safety Network/);
    expect(html).toMatch(/0\.34700/);
    expect(html).toMatch(/does not mean police or ambulance were automatically dispatched/i);
  });

  it("refuses invalid recipients and missing API key without pretending success", async () => {
    const bad = await sendIncidentEmail({
      to: "not-an-email",
      subject: "Test",
      incidentType: "general",
      patientOrReporterName: "Test",
      locationSummary: "Kampala",
      triageSummary: "Test",
      actionsTaken: [],
      status: "active",
    });
    expect(bad.success).toBe(false);
    expect(bad.error).toBe("invalid_recipient");

    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const unconfigured = await sendIncidentEmail({
      to: "clinic@example.com",
      subject: "Test",
      incidentType: "medical",
      patientOrReporterName: "Allan",
      locationSummary: "Kampala",
      triageSummary: "Bleeding",
      actionsTaken: [],
      status: "active",
    });
    expect(unconfigured.success).toBe(false);
    expect(unconfigured.error).toBe("email_not_configured");
    if (prev !== undefined) process.env.RESEND_API_KEY = prev;
  });
});
