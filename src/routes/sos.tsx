import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Check, Loader2, MapPin, Phone, ShieldAlert, Siren } from "lucide-react";
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
  component: SosScreen,
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
    if (value >= 1) { void activate(); return; }
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
    if (error) { toast.error("SOS active, but the report could not be stored."); return; }
    setReference(data.reference);
  }

  return (
    <AppShell title="Emergency SOS">
      <div className="mx-auto w-full max-w-6xl px-5 pt-6 pb-6 lg:px-10 lg:pt-10">

        {/* Page header */}
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/12">
            <Siren className="h-6 w-6 text-primary" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-black tracking-[-0.03em] lg:text-3xl">Emergency SOS</h1>
            <p className="text-[12px] text-muted-foreground lg:text-[13px]">Hold the button to activate — your location is captured and help is alerted</p>
          </div>
        </div>

        {/* Desktop 2-column / mobile stacked */}
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">

          {/* Left: SOS button */}
          <div className="flex flex-col items-center">
            <div className="relative w-full max-w-sm overflow-hidden rounded-[2.5rem] border border-primary/20 bg-gradient-to-b from-primary/8 to-transparent p-10 text-center">
              <div className="absolute inset-0 hero-glow opacity-50" />

              <span className="relative inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/12 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
                <ShieldAlert className="h-3.5 w-3.5" />
                {active ? "SOS active" : "Hold to activate"}
              </span>

              <p className="relative mt-4 text-[13px] leading-relaxed text-muted-foreground">
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
                className="relative mx-auto mt-8 grid h-56 w-56 select-none place-items-center rounded-full"
                style={{ touchAction: "none" }}
              >
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `conic-gradient(var(--color-primary) ${progress * 360}deg, color-mix(in oklab, var(--color-primary) 14%, transparent) 0deg)`,
                  }}
                />
                <span aria-hidden className="absolute inset-[9px] rounded-full border border-gold/30 bg-background" />
                <span className="relative z-10 grid h-36 w-36 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-center shadow-lift">
                  <span className="font-display text-2xl font-black tracking-[0.14em] text-primary-foreground">SOS</span>
                </span>
              </motion.button>

              {active && (
                <div className="relative mt-6 rounded-2xl border border-border/60 bg-card/70 p-3 text-left text-[11.5px] text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    {locating
                      ? "Getting your location…"
                      : coords
                        ? `Location: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
                        : "Location unavailable"}
                  </p>
                  <p className="mt-2 flex items-center gap-2">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-success" />}
                    {!user
                      ? "Sign in to store this emergency on your account."
                      : saving
                        ? "Saving emergency report…"
                        : reference
                          ? `Report saved — ref: ${reference}`
                          : "Report not saved."}
                  </p>
                </div>
              )}
            </div>

            <p className="mt-4 max-w-sm text-center text-[10px] leading-relaxed text-muted-foreground/55">{DISCLAIMER}</p>
          </div>

          {/* Right: Emergency numbers */}
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60">
              Emergency numbers
            </p>
            <div className="space-y-2.5">
              {EMERGENCY_NUMBERS.map((entry) => (
                <a
                  key={`${entry.label}-${entry.number}`}
                  href={`tel:${entry.number}`}
                  className="group flex items-center gap-4 rounded-2xl border border-border/60 bg-card/80 p-4 backdrop-blur-sm transition-all hover:border-primary/40 hover:bg-accent hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 transition-transform group-hover:scale-105">
                    <Phone className="h-5 w-5 text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold leading-tight">{entry.label}</span>
                    <span className="block text-[11.5px] text-muted-foreground">{entry.description}</span>
                  </div>
                  <span className="shrink-0 rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 font-display text-[15px] font-black tracking-wide text-primary-foreground shadow-soft">
                    {entry.number}
                  </span>
                </a>
              ))}
            </div>

            {/* Tips card */}
            <div className="mt-6 rounded-2xl border border-gold/25 bg-gold/5 p-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
                Stay safe
              </p>
              <ul className="space-y-2 text-[13px] text-muted-foreground">
                {[
                  "Move to a safe location before activating SOS",
                  "Call emergency services as well — Allma supplements, not replaces",
                  "Share your location with a trusted contact",
                  "Keep your phone charged in case of emergencies",
                ].map((tip) => (
                  <li key={tip} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold/70" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
