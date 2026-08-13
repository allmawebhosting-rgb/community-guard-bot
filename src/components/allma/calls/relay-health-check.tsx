import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RadioTower } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { checkRelayHealth } from "@/lib/relay-health.functions";
import type { RelayHealth } from "@/lib/relay-health.server";

/**
 * Production diagnostic for the TURN relay. Every line shown here comes from a
 * real request to the provider — nothing is simulated.
 */
export function RelayHealthCheck() {
  const run = useServerFn(checkRelayHealth);
  const [result, setResult] = useState<RelayHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await run({}));
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : "The relay check could not run.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[1.75rem] border border-border/60 bg-card/80 p-5 shadow-soft backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <RadioTower className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-tight">Call relay health</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            Asks the relay provider for real credentials, the same way a live call does, and shows
            exactly what it answers. Without a working relay, calls still connect on most Wi-Fi but
            can fail on mobile networks.
          </p>

          <Button type="button" size="sm" className="mt-3" disabled={busy} onClick={() => void check()}>
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {busy ? "Checking relay…" : "Run relay check"}
          </Button>

          {error && (
            <p className="mt-3 text-[12.5px] leading-relaxed text-destructive">{error}</p>
          )}

          {result && (
            <div className="mt-4 space-y-3">
              <div
                className={`flex items-start gap-2 rounded-2xl border p-3 ${
                  result.relayReady
                    ? "border-primary/30 bg-primary/5"
                    : "border-destructive/30 bg-destructive/5"
                }`}
              >
                {result.relayReady ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <p className="text-[12.5px] font-medium leading-relaxed">
                  {result.relayReady
                    ? "Relay credentials were issued. Calls can fall back to a relay when a direct connection fails."
                    : result.configured
                      ? "No relay is usable right now. Calls will run direct-only and may fail behind mobile-carrier NAT."
                      : "No relay provider is configured for this deployment. Calls are direct-only."}
                </p>
              </div>

              {result.probes.map((probe) => (
                <div key={probe.provider} className="rounded-2xl border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12.5px] font-semibold">{probe.label}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        probe.ok
                          ? "bg-primary/10 text-primary"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {probe.ok ? "OK" : probe.status ? `HTTP ${probe.status}` : "Failed"}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                    {probe.summary}
                  </p>
                  {probe.detail && (
                    <pre className="mt-2 overflow-x-auto rounded-xl bg-muted/60 p-2 text-[11px] leading-relaxed text-muted-foreground">
                      {probe.detail}
                    </pre>
                  )}
                </div>
              ))}

              <dl className="grid grid-cols-2 gap-2 text-[11.5px] text-muted-foreground">
                <div>
                  <dt className="font-medium text-foreground/80">Metered app</dt>
                  <dd>{result.config.meteredApp ?? "not set"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground/80">Metered key</dt>
                  <dd>
                    {result.config.meteredKey
                      ? `saved, ${result.config.meteredKeyLength} characters`
                      : "not saved"}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground/80">TURN addresses</dt>
                  <dd>{result.config.turnUrls || "none"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground/80">TURN shared secret</dt>
                  <dd>{result.config.turnSecret ? "saved" : "not saved"}</dd>
                </div>
              </dl>

              <p className="text-[11px] text-muted-foreground">
                Checked {new Date(result.checkedAt).toLocaleTimeString()}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
