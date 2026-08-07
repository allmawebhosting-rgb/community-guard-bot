import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { failed, json, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "manage_emergency_contacts",
  title: "Emergency contacts",
  description:
    "List the signed-in citizen's emergency contacts, or add a new one that will be notified when they raise an SOS.",
  inputSchema: {
    action: z.string().describe("Either 'list' or 'add'."),
    name: z.string().optional().describe("Contact name, required when adding."),
    phone: z.string().optional().describe("Contact phone number, required when adding."),
    relationship: z.string().optional().describe("How this person relates to the user, e.g. sister."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ action, name, phone, relationship }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);

    if (action === "add") {
      if (!name?.trim() || !phone?.trim()) return failed("Both name and phone are required to add a contact.");
      const { data, error } = await supabase
        .from("emergency_contacts")
        .insert({
          user_id: ctx.getUserId(),
          name: name.trim(),
          phone: phone.trim(),
          relationship: relationship?.trim() ?? null,
        })
        .select("id, name, phone, relationship")
        .maybeSingle();
      if (error) return failed(error.message);
      return json({ added: data });
    }

    if (action !== "list") return failed("Unknown action. Use 'list' or 'add'.");

    const { data, error } = await supabase
      .from("emergency_contacts")
      .select("id, name, phone, relationship, created_at")
      .order("created_at", { ascending: true });
    if (error) return failed(error.message);
    return json({ count: data?.length ?? 0, contacts: data ?? [] });
  },
});
