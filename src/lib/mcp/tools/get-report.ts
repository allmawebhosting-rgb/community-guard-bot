import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { failed, json, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "get_report",
  title: "Get a safety report",
  description:
    "Fetch one of the signed-in citizen's safety reports in full, by report id or reference number, including status history.",
  inputSchema: {
    reference: z.string().optional().describe("Report reference number, e.g. ALM-1234."),
    id: z.string().optional().describe("Report UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ reference, id }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    if (!reference && !id) return failed("Provide either a report id or a reference number.");
    const supabase = supabaseForUser(ctx);
    let query = supabase.from("reports").select("*").limit(1);
    query = id ? query.eq("id", id) : query.eq("reference", reference!);
    const { data, error } = await query.maybeSingle();
    if (error) return failed(error.message);
    if (!data) return failed("No report found for that identifier.");

    const { data: history } = await supabase
      .from("report_status_history")
      .select("*")
      .eq("report_id", data.id)
      .order("created_at", { ascending: true });

    return json({ report: data, status_history: history ?? [] });
  },
});
