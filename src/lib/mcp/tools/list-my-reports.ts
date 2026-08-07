import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { failed, json, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_my_reports",
  title: "List my safety reports",
  description:
    "List the signed-in citizen's own safety reports (crime, missing person, lost & found, etc.) with status and reference number.",
  inputSchema: {
    status: z.string().optional().describe("Optional status filter, e.g. submitted, under_review, resolved."),
    limit: z.number().int().optional().describe("Maximum rows to return, default 20, capped at 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const take = Math.min(Math.max(limit ?? 20, 1), 50);
    let query = supabaseForUser(ctx)
      .from("reports")
      .select(
        "id, reference, title, report_type, category, status, priority, risk_level, location_text, district, summary, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(take);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return failed(error.message);
    return json({ count: data?.length ?? 0, reports: data ?? [] });
  },
});
