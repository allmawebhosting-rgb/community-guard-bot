import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { failed, json, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "create_report",
  title: "File a safety report",
  description:
    "File a new non-emergency safety report for the signed-in citizen. For a life-threatening emergency, tell the user to call 999 / use in-app SOS instead.",
  inputSchema: {
    title: z.string().describe("Short title for the incident."),
    report_type: z
      .string()
      .describe("Type of report, e.g. crime, missing_person, lost_found, suspicious_activity, other."),
    narrative: z.string().describe("What happened, in the reporter's own words."),
    location_text: z.string().optional().describe("Where it happened, in plain words."),
    district: z.string().optional().describe("Ugandan district, e.g. Kampala."),
    occurred_at: z.string().optional().describe("ISO timestamp of when it happened."),
    is_anonymous: z.boolean().optional().describe("Hide the reporter's identity from public views."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("reports")
      .insert({
        user_id: ctx.getUserId(),
        title: input.title.trim(),
        report_type: input.report_type.trim(),
        narrative: input.narrative.trim(),
        summary: input.narrative.trim().slice(0, 280),
        location_text: input.location_text?.trim() ?? null,
        district: input.district?.trim() ?? null,
        occurred_at: input.occurred_at ?? null,
        is_anonymous: input.is_anonymous ?? false,
      })
      .select("id, reference, title, status, created_at")
      .maybeSingle();
    if (error) return failed(error.message);
    return json({ created: data });
  },
});
