import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RelayHealth } from "./relay-health.server";

/**
 * Runs a live relay diagnostic against the configured TURN provider. Signed-in
 * only: it reveals no credentials, just whether the provider accepts ours and
 * the provider's exact error text.
 */
export const checkRelayHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<RelayHealth> => {
    const { runRelayHealthCheck } = await import("./relay-health.server");
    return runRelayHealthCheck();
  });
