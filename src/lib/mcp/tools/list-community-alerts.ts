import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { failed, json, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_community_alerts",
  title: "List community safety alerts",
  description: "List currently published community safety alerts and advisories, newest first.",
  inputSchema: {
    area: z.string().optional().describe("Optional area or district filter, matched loosely."),
    limit: z.number().int().optional().describe("Maximum rows, default 20, capped at 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ area, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const take = Math.min(Math.max(limit ?? 20, 1), 50);
    let query = supabaseForUser(ctx)
      .from("community_alerts")
      .select("id, title, body, alert_type, severity, area, starts_at, expires_at")
      .eq("is_published", true)
      .order("starts_at", { ascending: false })
      .limit(take);
    if (area) query = query.ilike("area", `%${area}%`);
    const { data, error } = await query;
    if (error) return failed(error.message);
    return json({ count: data?.length ?? 0, alerts: data ?? [] });
  },
});
