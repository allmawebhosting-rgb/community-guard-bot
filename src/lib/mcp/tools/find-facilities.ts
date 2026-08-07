import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { failed, json, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "find_facilities",
  title: "Find help facilities",
  description:
    "Find nearby help facilities such as police stations, hospitals and clinics, filtered by type, district or 24/7 availability.",
  inputSchema: {
    facility_type: z.string().optional().describe("Facility type, e.g. police, hospital, clinic, fire."),
    district: z.string().optional().describe("District name, matched loosely."),
    open_24_7: z.boolean().optional().describe("Only return facilities open around the clock."),
    limit: z.number().int().optional().describe("Maximum rows, default 20, capped at 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ facility_type, district, open_24_7, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const take = Math.min(Math.max(limit ?? 20, 1), 50);
    let query = supabaseForUser(ctx)
      .from("facilities")
      .select("id, name, facility_type, district, address, phone, is_24_7, latitude, longitude")
      .order("name")
      .limit(take);
    if (facility_type) query = query.eq("facility_type", facility_type);
    if (district) query = query.ilike("district", `%${district}%`);
    if (open_24_7) query = query.eq("is_24_7", true);
    const { data, error } = await query;
    if (error) return failed(error.message);
    return json({ count: data?.length ?? 0, facilities: data ?? [] });
  },
});
