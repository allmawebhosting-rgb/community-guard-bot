import { useEffect, useState } from "react";
import { Keyboard, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

export type VoiceMode = "on" | "off";
export const VOICE_MODE_SET = "allma:voice-mode-set";
export const VOICE_MODE_STATE = "allma:voice-mode-state";

export function setVoiceMode(mode: VoiceMode) {
  window.dispatchEvent(new CustomEvent(VOICE_MODE_SET, { detail: mode }));
}

export function useVoiceModeState() {
  const [mode, setMode] = useState<VoiceMode>("off");
  useEffect(() => {
    const h = (e: Event) => setMode((e as CustomEvent<VoiceMode>).detail);
    window.addEventListener(VOICE_MODE_STATE, h);
    window.dispatchEvent(new Event("allma:voice-mode-query"));
    return () => window.removeEventListener(VOICE_MODE_STATE, h);
  }, []);
  return mode;
}

/** Small Voice / Text pill that shows and switches the current mode. */
export function VoiceModeToggle({ className }: { className?: string }) {
  const mode = useVoiceModeState();
  return (
    <div role="group" aria-label="Assistant mode" className={cn("flex items-center rounded-full border border-border bg-card p-0.5 text-xs font-semibold", className)}>
      {(["off", "on"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => setVoiceMode(m)}
          className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors",
            mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {m === "on" ? <Mic className="size-3.5" /> : <Keyboard className="size-3.5" />}
          {m === "on" ? "Voice" : "Text"}
        </button>
      ))}
    </div>
  );
}
