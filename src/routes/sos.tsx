import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Check, Loader2, MapPin, Phone, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/allma/app-shell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { DISCLAIMER, EMERGENCY_NUMBERS } from "@/lib/allma";

export const Route = createFileRoute("/sos")({
  head: () => ({
    meta: [
      { title: "Emergency SOS — Allma Safety AI" },
      {
        name: "description",
        content:
          "Hold to activate an emergency SOS. Allma captures your location, shows Uganda emergency numbers and logs an emergency report.",
      },
      { property: "og:title", content: "Emergency SOS — Allma Safety AI" },
      {
        property: "og:description",
        content: "Hold to activate SOS, share your location and reach police, ambulance or fire instantly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SosScreen;
});

type Coords = { latitude: number; longitude: number };
const HOLD_MS = 2200;

function SosScreen() {
  const { user } = useAuth();
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const raf = useRef<number | null>(null);
  const start = useRef(0);

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  function tick() {
    const value = Math.min(1, (performance.now() - start.current) / HOLD_MS);
    setProgress(value);
    if (value >= 1) {
      void activate();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  }

  function beginHold() {
    if (active) return;
    start.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  }

  function endHold() {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    if (!active) setProgress(0);
  }

  function requestLocation(): Promise<Coords | null> {
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) return resolve(null);
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocating(false);
          const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
          setCoords(next);
          resolve(next);
        },
        () => {
          setLocating(false);
          toast.error("Location permission denied. You can still call for help.");
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 12000 },
      );
    });
  }

  async function activate() {
    setActive(true);
    setProgress(1);
    const position = await requestLocation();
    if (!user) return;

    setSaving(true);
    const { data, error } = await supabase
      .from("reports")
      .insert({
        user_id: user.id,
        report_type: "emergency",
        category: "sos",
        title: "Emergency SOS activated",
        summary: "The user triggered an SOS alert from the Allma Safety AI app.",
        narrative: "SOS activated by hold-to-confirm. Location captured where permission was granted.",
        risk_level: "critical",
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
        location_text: position
          ? `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`
          : "Location unavailable",
      })
      .select("reference")
      .single();
    setSaving(false);

    if (error) {
      toast.error("SOS active, but the report could not be stored.");
      return;
    }
    setReference(data.reference);
  }

  return (
    <AppShell title="Emergency SOS">
      <div className="flex flex-1 flex-col items-center px-5 pt-6">
        <span className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/12 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
          <ShieldAlert className="h-3.5 w-3.5" />
          {active ? "SOS active" : "Hold to activate"}
        </span>

        <h1 className="mt-4 text-center font-display text-[1.9rem] font-black leading-tight tracking-[-0.03em]">
          {active ? "Help is being alerted" : "Emergency SOS"}
        </h1>
        <p className="mt-2 max-w-sm text-center text-[13px] leading-relaxed text-muted-foreground">
          {active
            ? "Call an official emergency line now and stay somewhere safe."
            : "Press and hold the button for 2 seconds. Allma will capture your location and log an emergency report."}
        </p>

        <motion.button
          type="button"
          aria-label="Hold to activate emergency SOS"
          onPointerDown={beginHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          animate={active ? { scale: [1, 1.04, 1] } : { scale: 1 }}
          transition={active ? { repeat: Infinity, duration: 1.6 } : { duration: 0.2 }}
          className="relative mt-8 grid h-56 w-56 select-none place-items-center rounded-full"
          style={{ touchAction: "none" }}
        >
          <span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(var(--color-primary) ${progress * 360}deg, color-mix(in oklab, var(--color-primary) 14%, transparent) 0deg)`,
            }}
          />
          <span
            aria-hidden
            className="absolute inset-[9px] rounded-full border border-gold/30 bg-background"
          />
          <span className="relative z-10 grid h-36 w-36 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-center shadow-lift">
            <span className="font-display text-2xl font-black tracking-[0.14em] text-primary-foreground">SOS</span>
          </span>
        </motion.button>

        <div className="mt-8 w-full max-w-md space-y-2">
          {EMERGENCY_NUMBERS.map((entry) => (
            <a
              key={`${entry.label}-${entry.number}`}
              href={`tel:${entry.number}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/80 p-3 backdrop-blur-sm transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold">{entry.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{entry.description}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[13px] font-bold text-primary-foreground">
                <Phone className="h-3.5 w-3.5" />
                {entry.number}
              </span>
            </a>
          ))}
        </div>

        {active && (
          <div className="mt-4 w-full max-w-md rounded-2xl border border-border/60 bg-card/70 p-3 text-[11.5px] text-muted-foreground">
            <p className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              {locating
                ? "Getting your location…"
                : coords
                  ? `Location captured: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
                  : "Location unavailable"}
            </p>
            <p className="mt-2 flex items-center gap-2">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-success" />}
              {!user
                ? "Sign in to store this emergency on your account."
                : saving
                  ? "Saving emergency report…"
                  : reference
                    ? `Emergency report saved as ${reference}`
                    : "Emergency report not saved."}
            </p>
          </div>
        )}

        <p className="mt-5 max-w-md text-center text-[10px] leading-relaxed text-muted-foreground/55">{DISCLAIMER}</p>
      </div>
    </AppShell>
  );
}
