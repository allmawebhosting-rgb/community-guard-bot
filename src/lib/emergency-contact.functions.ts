import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  advanceEmergencyRun,
  armEmergencyRun,
  cancelEmergencyRun,
  getEmergencyRunView,
  type EmergencyRunView,
} from "@/lib/emergency-contact.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseRun(input: { runId: string }) {
  const runId = String(input?.runId ?? "");
  if (!UUID.test(runId)) throw new Error("Invalid emergency run");
  return { runId };
}

export const armEmergencyContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseRun)
  .handler(async ({ data, context }): Promise<EmergencyRunView | null> => armEmergencyRun(context.userId, data.runId));

export const advanceEmergencyContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseRun)
  .handler(async ({ data, context }): Promise<EmergencyRunView | null> => advanceEmergencyRun(context.userId, data.runId));

export const cancelEmergencyContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseRun)
  .handler(async ({ data, context }): Promise<EmergencyRunView | null> => cancelEmergencyRun(context.userId, data.runId));

export const getEmergencyContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseRun)
  .handler(async ({ data, context }): Promise<EmergencyRunView | null> => getEmergencyRunView(context.userId, data.runId));
