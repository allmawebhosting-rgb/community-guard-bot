import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Phone, ShieldAlert, MapPin, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DISCLAIMER, EMERGENCY_NUMBERS } from "@/lib/allma";
import { cn } from "@/lib/utils";

type Coords = { latitude: number; longitude: number };

export function SosButton() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"confirm" | "active">("confirm");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  function requestLocation(): Promise<Coords | null> {
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) { resolve(null); return; }
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocating(false);
          const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setCoords(next);
          resolve(next);
        },
        () => { setLocating(false); toast.error("Location denied. You can still call for help."); resolve(null); },
        { enableHighAccuracy: true, timeout: 12000 },
      );
    });
  }

  async function activate() {
    setStage("active");
    const position = await requestLocation();
    if (!user) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("reports")
      .insert({
        user_id: user.id, report_type: "emergency", category: "sos",
        title: "Emergency SOS activated",
        summary: "The user triggered an SOS alert from the Allma Safety AI app.",
        narrative: "SOS button activated. Location captured at the moment of activation where permission was granted.",
        risk_level: "critical",
        latitude: position?.latitude ?? null, longitude: position?.longitude ?? null,
        location_text: position ? `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}` : "Location unavailable",
      })
      .select("reference")
      .single();
    setSaving(false);
    if (error) { toast.error("SOS logged locally, but the report could not be stored."); return; }
    setReference(data.reference);
  }

  function reset() {
    setOpen(false);
    setTimeout(() => { setStage("confirm"); setReference(null); setCoords(null); }, 250);
  }

  return (
    <>
      {/* Floating button */}
      <motion.button
        type="button"
        aria-label="Emergency SOS"
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.92 }}
        className="no-print sos-pulse fixed bottom-24 right-4 z-50 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-[0_4px_20px_rgba(220,38,38,0.45)] sm:bottom-6 sm:right-6 lg:h-12 lg:w-12"
      >
        <ShieldAlert className="h-5 w-5 lg:h-4 lg:w-4" />
        <span className="text-[9px] font-black uppercase tracking-widest lg:text-[8px]">SOS</span>
      </motion.button>

      {/* Modal overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="dark fixed inset-0 z-[200] flex items-end justify-center sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {/* Scrim */}
            <motion.div
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
              onClick={reset}
            />

            {/* Sheet */}
            <motion.div
              className="relative z-10 w-full max-w-md overflow-hidden rounded-t-3xl bg-[#0d0d0d] sm:rounded-3xl"
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
            >
              {/* Drag handle (mobile) */}
              <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/15 sm:hidden" />

              {/* Close button */}
              <button
                onClick={reset}
                className="absolute right-4 top-4 grid h-7 w-7 place-items-center rounded-full bg-white/8 text-white/45 transition hover:bg-white/14"
              >
                <X className="h-3.5 w-3.5" />
              </button>

              {stage === "confirm" ? (
                <ConfirmStage onActivate={activate} onCancel={reset} />
              ) : (
                <ActiveStage
                  locating={locating}
                  coords={coords}
                  saving={saving}
                  reference={reference}
                  user={!!user}
                  onClose={reset}
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ConfirmStage({ onActivate, onCancel }: { onActivate: () => void; onCancel: () => void }) {
  return (
    <div className="px-6 pb-8 pt-6">
      {/* Icon */}
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-red-900/60">
        <ShieldAlert className="h-7 w-7 text-red-400" />
      </div>

      <h2 className="font-display text-xl font-black text-white">Activate Emergency SOS?</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">
        Allma will capture your GPS location, show emergency numbers and record an emergency report on your account.
      </p>

      {/* Disclaimer */}
      <div className="mt-4 rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-[12px] leading-relaxed text-white/30">
        {DISCLAIMER}
      </div>

      {/* Actions */}
      <div className="mt-5 flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 rounded-2xl border border-white/10 py-3.5 text-[13px] font-medium text-white/50 transition hover:border-white/18 hover:text-white/70"
        >
          Cancel
        </button>
        <button
          onClick={onActivate}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-700 py-3.5 text-[13px] font-bold text-white transition hover:bg-red-600"
        >
          <ShieldAlert className="h-4 w-4" /> Activate SOS
        </button>
      </div>
    </div>
  );
}

function ActiveStage({ locating, coords, saving, reference, user, onClose }: {
  locating: boolean; coords: Coords | null; saving: boolean;
  reference: string | null; user: boolean; onClose: () => void;
}) {
  return (
    <div className="px-5 pb-7 pt-5">
      {/* Live indicator */}
      <div className="mb-4 flex items-center gap-2.5">
        <div className="relative grid h-9 w-9 place-items-center rounded-full bg-red-900/70">
          <ShieldAlert className="h-4.5 w-4.5 text-red-300" />
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full border border-[#0d0d0d] bg-red-500" />
        </div>
        <div>
          <p className="font-display text-[14px] font-bold text-white">SOS Active</p>
          <p className="text-[11px] text-white/38">Call an emergency line now</p>
        </div>
      </div>

      {/* Call buttons */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
        {EMERGENCY_NUMBERS.map((e) => (
          <a
            key={e.label}
            href={`tel:${e.number}`}
            className="flex items-center justify-between rounded-xl border border-white/8 bg-white/5 px-3.5 py-3 transition hover:bg-white/9"
          >
            <div>
              <p className="text-[12px] font-semibold text-white/88">{e.label}</p>
              <p className="text-[10px] text-white/35">{(e as { description?: string }).description ?? "Tap to call"}</p>
            </div>
            <span className="flex items-center gap-1 rounded-xl bg-destructive px-2.5 py-1.5 text-[13px] font-black text-white shadow-[0_0_12px_rgba(220,38,38,0.4)]">
              <Phone className="h-3 w-3" />{e.number}
            </span>
          </a>
        ))}
      </div>

      {/* Status row */}
      <div className="mt-4 space-y-2 rounded-2xl border border-white/8 bg-white/4 px-4 py-3.5 text-[12px] text-white/38">
        <p className="flex items-center gap-2">
          {locating
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" /> Getting your location…</>
            : coords
              ? <><Check className="h-3.5 w-3.5 text-green-400" /> <span className="text-green-400/80">Location captured</span> · {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}</>
              : <><MapPin className="h-3.5 w-3.5" /> Location unavailable</>
          }
        </p>
        <p className={cn("flex items-center gap-2", !user && "opacity-60")}>
          {!user
            ? <><ShieldAlert className="h-3.5 w-3.5" /> Sign in to store this emergency on your account</>
            : saving
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" /> Saving emergency report…</>
              : reference
                ? <><Check className="h-3.5 w-3.5 text-green-400" /> <span className="text-green-400/80">Saved</span> · {reference}</>
                : <><ShieldAlert className="h-3.5 w-3.5" /> Emergency report not saved</>
          }
        </p>
      </div>

      <button
        onClick={onClose}
        className="mt-4 w-full rounded-2xl border border-white/10 py-3.5 text-[13px] font-medium text-white/45 transition hover:border-white/18 hover:text-white/65"
      >
        I'm safe — close
      </button>
    </div>
  );
}
