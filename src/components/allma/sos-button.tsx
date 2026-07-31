import { useState } from "react";
import { motion } from "motion/react";
import { Phone, ShieldAlert, MapPin, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DISCLAIMER, EMERGENCY_NUMBERS } from "@/lib/allma";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
      if (!("geolocation" in navigator)) {
        resolve(null);
        return;
      }
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocating(false);
          const next = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
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
    setStage("active");
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
        narrative:
          "SOS button activated. Location captured at the moment of activation where permission was granted.",
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
      toast.error("SOS saved locally, but the report could not be stored.");
      return;
    }
    setReference(data.reference);
  }

  function reset() {
    setOpen(false);
    setTimeout(() => {
      setStage("confirm");
      setReference(null);
      setCoords(null);
    }, 250);
  }

  return (
    <>
      <motion.button
        type="button"
        aria-label="Emergency SOS"
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.93 }}
        className="no-print sos-pulse fixed bottom-[7.5rem] right-4 z-50 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lift sm:bottom-[7.5rem] sm:right-6"
      >
        <ShieldAlert className="h-6 w-6" />
        <span className="text-[10px] font-bold tracking-widest">SOS</span>
      </motion.button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : reset())}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          {stage === "confirm" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <ShieldAlert className="h-5 w-5" /> Activate Emergency SOS?
                </DialogTitle>
                <DialogDescription>
                  Allma will capture your GPS location, show emergency numbers and record an
                  emergency report on your account.
                </DialogDescription>
              </DialogHeader>
              <p className="rounded-2xl bg-muted p-3 text-xs text-muted-foreground">{DISCLAIMER}</p>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" className="rounded-full" onClick={reset}>
                  Cancel
                </Button>
                <Button variant="destructive" className="rounded-full" onClick={activate}>
                  Yes, activate SOS
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-destructive">SOS active</DialogTitle>
                <DialogDescription>
                  Call an emergency line now. Stay on the line and keep yourself safe.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                {EMERGENCY_NUMBERS.map((entry) => (
                  <a
                    key={`${entry.label}-${entry.number}`}
                    href={`tel:${entry.number}`}
                    className="flex items-center justify-between rounded-2xl border border-border bg-card p-3 transition-colors hover:bg-accent"
                  >
                    <span>
                      <span className="block text-sm font-semibold">{entry.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {entry.description}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 rounded-full bg-destructive px-3 py-1.5 text-sm font-bold text-destructive-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      {entry.number}
                    </span>
                  </a>
                ))}
              </div>

              <div className="rounded-2xl bg-muted p-3 text-xs text-muted-foreground">
                <p className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5" />
                  {locating
                    ? "Getting your location…"
                    : coords
                      ? `Location captured: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
                      : "Location unavailable"}
                </p>
                <p className="mt-2 flex items-center gap-2">
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {!user
                    ? "Sign in to store this emergency on your account."
                    : saving
                      ? "Saving emergency report…"
                      : reference
                        ? `Emergency report saved as ${reference}`
                        : "Emergency report not saved."}
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" className="w-full rounded-full" onClick={reset}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
