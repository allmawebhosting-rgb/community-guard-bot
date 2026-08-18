import { useEffect, useState } from "react";
import { Activity, Brain, Loader2, Mic, MoveDiagonal, ShieldCheck, Siren } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import {
  AUDIT_LABELS,
  DEFAULT_SMART_SOS_SETTINGS,
  listRecentChecks,
  loadSmartSosSettings,
  saveSmartSosSettings,
  type SmartSosCheck,
  type SmartSosSettings,
} from "@/lib/smart-sos";

const CHECK_STATUS_LABELS: Record<string, string> = {
  open: "Awaiting response",
  safe: "You confirmed safe",
  help_requested: "You requested help",
  expired: "No response",
  cancelled: "Cancelled",
  escalated: "Escalated to SOS",
};

export function SmartSosPrivacyCenter() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SmartSosSettings>(DEFAULT_SMART_SOS_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [checks, setChecks] = useState<SmartSosCheck[]>([]);
  const [motionPermission, setMotionPermission] = useState<"unknown" | "granted" | "denied">("unknown");

  const needsMotionPermission =
    typeof window !== "undefined" &&
    typeof (window as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } })
      .DeviceMotionEvent?.requestPermission === "function";

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const [next, recent] = await Promise.all([
        loadSmartSosSettings(user.id),
        listRecentChecks(user.id),
      ]);
      if (cancelled) return;
      setSettings(next);
      setChecks(recent);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function update(key: keyof SmartSosSettings, value: boolean) {
    if (!user) return;
    setSaving(key);
    setSettings((current) => ({ ...current, [key]: value }));
    await saveSmartSosSettings(user.id, { [key]: value });
    setSaving(null);
  }

  async function requestMotionPermission() {
    const ctor = (window as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } })
      .DeviceMotionEvent;
    try {
      const result = await ctor?.requestPermission?.();
      setMotionPermission(result === "granted" ? "granted" : "denied");
      if (result === "granted") await update("motion_detection", true);
    } catch {
      setMotionPermission("denied");
    }
  }

  if (!user) return null;

  const monitoring = settings.enabled;

  const rows: {
    key: keyof SmartSosSettings;
    icon: typeof Activity;
    label: string;
    desc: string;
    disabled?: boolean;
  }[] = [
    {
      key: "inactivity_seconds" as keyof SmartSosSettings,
      icon: Activity,
      label: "Inactivity check-in",
      desc: `If you don't touch the screen for ${settings.inactivity_seconds}s while Allma is open, we ask if you're okay. Always on with the master switch.`,
      disabled: true,
    },
    {
      key: "motion_detection",
      icon: MoveDiagonal,
      label: "Movement signals",
      desc: "Uses your phone's motion sensor while Allma is open to notice falls or sudden impacts. No location or movement history is stored.",
    },
    {
      key: "audio_detection",
      icon: Mic,
      label: "Environmental sound",
      desc: "Analyses loudness on your device only during a safety check. Nothing is recorded, stored or uploaded.",
    },
    {
      key: "auto_escalation",
      icon: Siren,
      label: "Automatic SOS",
      desc: "If several signals agree and you don't respond, Allma opens SOS for you. Off means you always tap to activate.",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10">
          <Brain className="h-4 w-4 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold">Smart safety checks</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
            Allma can check in on you while the app is open. Detection only runs in the foreground —
            it cannot monitor you in the background.
          </p>
        </div>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Switch
            checked={settings.enabled}
            onCheckedChange={(value) => void update("enabled", value)}
            aria-label="Enable smart safety checks"
          />
        )}
      </div>

      {monitoring && (
        <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/[0.07] px-3 py-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          <p className="text-[11.5px] font-semibold text-green-700 dark:text-green-300">
            Monitoring active while this app is open
          </p>
        </div>
      )}

      <div className="space-y-3">
        {rows.map(({ key, icon: Icon, label, desc, disabled }) => (
          <div key={String(key)} className="flex items-start gap-3 rounded-xl border border-border/50 px-3 py-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-card">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold">{label}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{desc}</p>
              {key === "motion_detection" && needsMotionPermission && motionPermission !== "granted" && (
                <button
                  type="button"
                  onClick={() => void requestMotionPermission()}
                  className="mt-2 rounded-lg border border-border/70 px-2.5 py-1 text-[11px] font-semibold transition hover:bg-accent"
                >
                  {motionPermission === "denied" ? "Motion access denied — try again" : "Allow motion access"}
                </button>
              )}
            </div>
            {disabled ? (
              <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground/50" />
            ) : saving === key ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Switch
                checked={Boolean(settings[key])}
                disabled={!settings.enabled}
                onCheckedChange={(value) => void update(key, value)}
                aria-label={label}
              />
            )}
          </div>
        ))}
      </div>

      <div>
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
          Recent safety checks
        </p>
        {checks.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground">
            No safety checks yet. Anything Allma detects will be listed here.
          </p>
        ) : (
          <ul className="space-y-2">
            {checks.map((check) => (
              <li
                key={check.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold">
                    {CHECK_STATUS_LABELS[check.status] ?? AUDIT_LABELS[check.status] ?? check.status}
                  </p>
                  <p className="text-[10.5px] text-muted-foreground">
                    {new Date(check.created_at).toLocaleString("en-UG", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {check.confidence} confidence
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
