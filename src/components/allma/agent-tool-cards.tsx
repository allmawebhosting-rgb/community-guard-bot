import { useState } from "react";
import { Check, Copy, Mail, Phone, MapPin, Siren } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatKm } from "@/lib/facility-distance";
import { formatEtaLabel } from "@/lib/facility-etas";

export function EmailSentCard({
  output,
}: {
  output: {
    success?: boolean;
    to?: string;
    subject?: string;
    timestamp?: string;
    messageId?: string | null;
    error?: string;
  };
}) {
  const ok = Boolean(output.success);
  const when = output.timestamp
    ? new Date(output.timestamp).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;
  return (
    <details className="chat-card group w-full overflow-hidden p-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-sm font-semibold text-foreground">
        <Mail className={cn("h-4 w-4 shrink-0", ok ? "text-emerald-600" : "text-destructive")} />
        <span className="min-w-0 flex-1 truncate">
          {ok ? "Incident email sent" : "Email not sent"}
          {output.to ? ` · ${output.to}` : ""}
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">{when}</span>
      </summary>
      <div className="space-y-1.5 border-t border-border/60 px-3.5 py-3 text-[13px] text-muted-foreground">
        {output.subject ? (
          <p>
            <span className="font-semibold text-foreground">Subject:</span> {output.subject}
          </p>
        ) : null}
        {ok && output.messageId ? (
          <p className="truncate text-[11px]">Ref: {output.messageId}</p>
        ) : null}
        {!ok ? (
          <p className="text-destructive">
            {output.error === "email_not_configured"
              ? "Email delivery is not configured on this deployment (RESEND_API_KEY)."
              : output.error || "The email could not be delivered."}
          </p>
        ) : null}
      </div>
    </details>
  );
}

export function EmergencyDispatchCard({
  output,
}: {
  output: {
    official_number?: string;
    official_label?: string;
    secondary_numbers?: Array<{ label: string; number: string }>;
    nearest_station?: {
      name: string;
      phone: string | null;
      address: string | null;
      distance_km: number | null;
    } | null;
    spoken_script?: string;
    disclaimer?: string;
  };
}) {
  const [copied, setCopied] = useState(false);
  const primary = String(output.official_number || "999");
  const primaryLabel = String(output.official_label || `Call ${primary}`);
  const script = String(output.spoken_script || "").trim();
  const station = output.nearest_station;

  const copyScript = async () => {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="chat-card w-full space-y-3 p-4">
      <div className="flex items-start gap-2">
        <Siren className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div>
          <p className="text-sm font-bold text-foreground">Emergency call bridge</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {output.disclaimer ||
              "Allma never auto-dials 999, 112, or 911 — tap to call, then read the script."}
          </p>
        </div>
      </div>

      <a
        href={`tel:${primary}`}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-destructive px-4 text-sm font-bold text-destructive-foreground"
      >
        <Phone className="h-4 w-4" /> {primaryLabel}
      </a>

      <div className="flex flex-wrap gap-2">
        {(output.secondary_numbers ?? []).map((row) => (
          <a
            key={row.number}
            href={`tel:${row.number}`}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-3 text-[13px] font-semibold text-foreground"
          >
            <Phone className="h-3.5 w-3.5" /> {row.label}
          </a>
        ))}
        {station?.phone ? (
          <a
            href={`tel:${station.phone.replace(/[^\d+]/g, "")}`}
            className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 text-[13px] font-semibold text-foreground"
          >
            <Phone className="h-3.5 w-3.5" /> Call {station.name}
            {formatKm(station.distance_km) ? ` · ${formatKm(station.distance_km)}` : ""}
          </a>
        ) : null}
      </div>

      {script ? (
        <div className="rounded-2xl border border-border/70 bg-secondary/30 p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Read this to the operator
            </p>
            <button
              type="button"
              onClick={() => void copyScript()}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy script"}
            </button>
          </div>
          <p className="text-[14px] leading-relaxed text-foreground">{script}</p>
        </div>
      ) : null}

      {station && !station.phone ? (
        <p className="text-[12px] text-muted-foreground">
          Nearest desk: {station.name}
          {station.address ? ` — ${station.address}` : ""}
          {formatKm(station.distance_km) ? ` (${formatKm(station.distance_km)})` : ""}. No local phone on file —
          use {primaryLabel}.
        </p>
      ) : null}
    </div>
  );
}

/** Enhanced facility row actions used by search_safety_resources / find_facilities. */
export function SafetyResourceActions({
  phone,
  lat,
  lng,
  name,
  onGuide,
}: {
  phone: string | null;
  lat: number | null;
  lng: number | null;
  name: string;
  onGuide?: () => void;
}) {
  const dest =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
      ? `${lat},${lng}`
      : encodeURIComponent(name);
  return (
    <div className="mt-2.5 flex gap-2">
      {phone ? (
        <a
          href={`tel:${phone.replace(/[^\d+]/g, "")}`}
          className="inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background px-3 text-[13px] font-semibold text-foreground"
        >
          <Phone className="h-3.5 w-3.5 shrink-0" /> Call place
        </a>
      ) : null}
      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${dest}`}
        target="_blank"
        rel="noreferrer"
        onClick={onGuide}
        className="inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-chat-accent px-3 text-[13px] font-semibold text-chat-accent-foreground"
      >
        <MapPin className="h-3.5 w-3.5 shrink-0" /> Guide me here
      </a>
    </div>
  );
}

export function resourceMetaLine(facility: Record<string, unknown>) {
  const km =
    facility.distance_km != null && Number.isFinite(Number(facility.distance_km))
      ? Number(facility.distance_km)
      : null;
  const eta =
    typeof facility.eta_label === "string" && facility.eta_label
      ? facility.eta_label
      : formatEtaLabel(km);
  return [
    eta || null,
    facility.open_now === true ? "Open now" : null,
    facility.is_24_7 === true ? "24/7" : null,
    typeof facility.address === "string" ? facility.address : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
