import { createFileRoute } from "@tanstack/react-router";
import { isBrowserAgentConfigured } from "@/lib/vps-browser-agent";

/**
 * Lightweight probe: is the VPS booking agent reachable from this Worker?
 * Does not expose secrets. Used to diagnose Worker → VPS connectivity.
 */
export const Route = createFileRoute("/api/browser-agent-status")({
  server: {
    handlers: {
      GET: async () => {
        const configured = isBrowserAgentConfigured();
        const cf = (globalThis as { __env__?: Record<string, unknown> }).__env__;
        const baseFromCf =
          typeof cf?.VPS_AGENT_BASE_URL === "string" ? cf.VPS_AGENT_BASE_URL.trim().replace(/\/$/, "") : "";
        const baseFromProcess = (process.env.VPS_AGENT_BASE_URL || "").trim().replace(/\/$/, "");
        const base = baseFromProcess || baseFromCf;
        const tokenFromCf = typeof cf?.VPS_AGENT_SECRET_TOKEN === "string" && cf.VPS_AGENT_SECRET_TOKEN.trim().length > 0;
        const tokenFromProcess = Boolean((process.env.VPS_AGENT_SECRET_TOKEN || "").trim());

        let health: { ok: boolean; status?: number; body?: string; error?: string } = { ok: false };
        let authed: { ok: boolean; status?: number; body?: string; error?: string } = { ok: false };

        if (base) {
          try {
            const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(15_000) });
            const body = (await res.text()).slice(0, 200);
            health = { ok: res.ok, status: res.status, body };
          } catch (error) {
            health = {
              ok: false,
              error: error instanceof Error ? error.message : "fetch failed",
            };
          }

          const token =
            (process.env.VPS_AGENT_SECRET_TOKEN || "").trim() ||
            (typeof cf?.VPS_AGENT_SECRET_TOKEN === "string" ? cf.VPS_AGENT_SECRET_TOKEN.trim() : "");
          if (token) {
            try {
              // Lightweight auth check — do not start a Playwright booking.
              const res = await fetch(`${base}/api/vault/domains`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(15_000),
              });
              const body = (await res.text()).slice(0, 300);
              authed = { ok: res.ok, status: res.status, body };
            } catch (error) {
              authed = {
                ok: false,
                error: error instanceof Error ? error.message : "fetch failed",
              };
            }
          }
        }

        return Response.json({
          configured,
          baseHost: base ? base.replace(/^(https?:\/\/)/, "").split("/")[0] : null,
          secrets: {
            baseFromProcess: Boolean(baseFromProcess),
            baseFromCf: Boolean(baseFromCf),
            tokenFromProcess,
            tokenFromCf,
          },
          health,
          authedProbe: authed,
        });
      },
    },
  },
});
