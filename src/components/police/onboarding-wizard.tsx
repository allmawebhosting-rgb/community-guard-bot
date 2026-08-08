import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bell,
  Building2,
  Check,
  IdCard,
  Loader2,
  Mail,
  MapPinned,
  Shield,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RANKS, isCommandRank, rankLabel, stationsQuery, type OfficerRank } from "@/lib/police";
import { cn } from "@/lib/utils";

type Draft = {
  full_name: string;
  phone: string;
  badge_number: string;
  force_id: string;
  rank: OfficerRank | "";
  station_id: string;
  jurisdiction_level: string;
  jurisdiction_area: string;
  official_email: string;
  prefs: { desktop: boolean; sms: boolean; email: boolean; push: boolean; scope: string };
};

const STEPS = [
  { title: "Welcome", subtitle: "Allma Police Command Center", icon: Shield },
  { title: "Your identity", subtitle: "Who is signing on", icon: UserRound },
  { title: "Service credentials", subtitle: "Badge, force ID and rank", icon: IdCard },
  { title: "Duty station", subtitle: "Where you are posted", icon: Building2 },
  { title: "Jurisdiction", subtitle: "The area you command", icon: MapPinned },
  { title: "Official contact", subtitle: "Where dispatch reaches you", icon: Mail },
  { title: "Alerts", subtitle: "How you want to be notified", icon: Bell },
  { title: "Review & activate", subtitle: "Confirm and sign on", icon: BadgeCheck },
];

const JURISDICTIONS = ["Station", "Division", "District", "Regional", "National"];

const COMMAND_ACCESS_CODE = "allma2580";

export function OnboardingWizard({ userId, email }: { userId: string; email: string }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [accessCode, setAccessCode] = useState("");
  const {
    data: stations = [],
    isLoading: stationsLoading,
    isError: stationsError,
  } = useQuery(stationsQuery);
  const [draft, setDraft] = useState<Draft>({
    full_name: "",
    phone: "",
    badge_number: "",
    force_id: "",
    rank: "",
    station_id: "",
    jurisdiction_level: "Station",
    jurisdiction_area: "",
    official_email: email,
    prefs: { desktop: true, sms: false, email: true, push: true, scope: "critical" },
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const station = stations.find((s) => s.id === draft.station_id);

  const canAdvance = (() => {
    if (step === 0) return accessCode.trim() === COMMAND_ACCESS_CODE;
    if (step === 1) return draft.full_name.trim().length > 2 && draft.phone.trim().length > 8;
    if (step === 2) return draft.badge_number.trim().length > 2 && !!draft.rank;
    if (step === 3) return !!draft.station_id;
    if (step === 5) return /.+@.+\..+/.test(draft.official_email);
    return true;
  })();

  const submit = useMutation({
    mutationFn: async () => {
      const { count } = await supabase
        .from("officer_profiles")
        .select("id", { count: "exact", head: true })
        .eq("status", "verified");
      const bootstrap = (count ?? 0) === 0;

      const { error } = await supabase.from("officer_profiles").upsert(
        {
          user_id: userId,
          full_name: draft.full_name.trim(),
          phone: draft.phone.trim(),
          badge_number: draft.badge_number.trim().toUpperCase(),
          force_id: draft.force_id.trim() || null,
          rank: draft.rank as OfficerRank,
          station_id: draft.station_id,
          jurisdiction_level: draft.jurisdiction_level,
          jurisdiction_area: draft.jurisdiction_area.trim() || station?.district || null,
          official_email: draft.official_email.trim(),
          notification_prefs: draft.prefs,
          onboarding_step: 8,
          onboarding_completed: true,
          status: bootstrap ? "verified" : "pending",
          duty_status: bootstrap ? "available" : "offline",
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      return bootstrap;
    },
    onSuccess: (bootstrap) => {
      toast.success(bootstrap ? "Command access activated" : "Submitted for verification");
      qc.invalidateQueries({ queryKey: ["officer", "me"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const Icon = STEPS[step].icon;
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="signal-streak min-h-screen px-4 py-8">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow shadow-lift">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold tracking-tight">Allma Command</p>
            <p className="text-[11px] text-muted-foreground">Uganda Police operating system</p>
          </div>
        </div>

        <div className="premium-surface overflow-hidden rounded-3xl border border-border/60 shadow-lift">
          <div className="h-1 w-full bg-border/40">
            <motion.div
              className="h-full bg-gradient-to-r from-primary via-primary-glow to-gold"
              animate={{ width: `${progress}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>

          <div className="p-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl border border-border/60 bg-secondary/60">
                <Icon className="h-4.5 w-4.5 text-gold" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Step {step + 1} of {STEPS.length}
                </p>
                <h1 className="truncate font-display text-lg font-semibold">{STEPS[step].title}</h1>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
                className="space-y-4"
              >
                {step === 0 && (
                  <div className="space-y-4 text-sm text-muted-foreground">
                    <p className="text-base text-foreground">
                      This is a restricted police operating system for receiving citizen reports,
                      verifying incidents, dispatching officers and managing cases across Uganda.
                    </p>
                    <ul className="space-y-2">
                      {[
                        "Every action you take is recorded in an audit trail",
                        "Case data is confidential and must not be shared outside the force",
                        "Your account is activated only after command verification",
                      ].map((line) => (
                        <li
                          key={line}
                          className="flex gap-2.5 rounded-2xl border border-border/50 bg-secondary/40 p-3"
                        >
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Access code gate */}
                    <div className="space-y-1.5 rounded-2xl border border-border/60 bg-secondary/40 p-4">
                      <Label className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        <KeyRound className="h-3.5 w-3.5" /> Command access code
                      </Label>
                      <Input
                        type="password"
                        value={accessCode}
                        maxLength={32}
                        placeholder="Enter your access code"
                        onChange={(e) => setAccessCode(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && canAdvance && setStep(1)}
                        className="font-mono tracking-widest"
                      />
                      {accessCode.length > 0 && accessCode.trim() !== COMMAND_ACCESS_CODE && (
                        <p className="text-[11px] text-destructive">Incorrect access code.</p>
                      )}
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <>
                    <Field label="Full name (as on your service record)">
                      <Input
                        value={draft.full_name}
                        maxLength={80}
                        placeholder="e.g. Assistant Supt. Grace Nakato"
                        onChange={(e) => set("full_name", e.target.value)}
                      />
                    </Field>
                    <Field label="Mobile number">
                      <Input
                        value={draft.phone}
                        maxLength={20}
                        placeholder="+2567..."
                        onChange={(e) => set("phone", e.target.value)}
                      />
                    </Field>
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Badge number">
                        <Input
                          value={draft.badge_number}
                          maxLength={24}
                          placeholder="UPF-00231"
                          onChange={(e) => set("badge_number", e.target.value)}
                        />
                      </Field>
                      <Field label="Force ID (optional)">
                        <Input
                          value={draft.force_id}
                          maxLength={24}
                          onChange={(e) => set("force_id", e.target.value)}
                        />
                      </Field>
                    </div>
                    <Field label="Rank / role">
                      <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                        {RANKS.map((rank) => (
                          <button
                            key={rank.value}
                            type="button"
                            onClick={() => set("rank", rank.value)}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-left text-sm transition",
                              draft.rank === rank.value
                                ? "border-primary/60 bg-primary/10 text-foreground"
                                : "border-border/50 bg-secondary/35 text-muted-foreground hover:border-border",
                            )}
                          >
                            <span className="min-w-0 truncate">{rank.label}</span>
                            <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                              {rank.group}
                            </span>
                          </button>
                        ))}
                      </div>
                    </Field>
                  </>
                )}

                {step === 3 && (
                  <Field label="Select your duty station">
                    <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                      {stationsLoading && (
                        <p className="rounded-2xl border border-border/50 bg-secondary/35 p-4 text-sm text-muted-foreground">
                          Loading available police stations…
                        </p>
                      )}
                      {stationsError && (
                        <p className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                          We could not load police stations. Refresh the page and try again.
                        </p>
                      )}
                      {!stationsLoading && !stationsError && stations.length === 0 && (
                        <p className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm text-gold">
                          No duty stations are available yet. Please ask an administrator to add
                          your station before continuing.
                        </p>
                      )}
                      {!stationsLoading &&
                        !stationsError &&
                        stations.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => set("station_id", s.id)}
                            className={cn(
                              "w-full rounded-2xl border px-3.5 py-2.5 text-left transition",
                              draft.station_id === s.id
                                ? "border-primary/60 bg-primary/10"
                                : "border-border/50 bg-secondary/35 hover:border-border",
                            )}
                          >
                            <p className="text-sm font-medium">{s.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {s.district} district · {s.region} region
                            </p>
                          </button>
                        ))}
                    </div>
                  </Field>
                )}

                {step === 4 && (
                  <>
                    <Field label="Jurisdiction level">
                      <div className="flex flex-wrap gap-1.5">
                        {JURISDICTIONS.map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => set("jurisdiction_level", level)}
                            className={cn(
                              "rounded-full border px-3.5 py-1.5 text-xs transition",
                              draft.jurisdiction_level === level
                                ? "border-gold/60 bg-gold/12 text-gold"
                                : "border-border/50 bg-secondary/35 text-muted-foreground",
                            )}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label="Area of responsibility">
                      <Input
                        value={draft.jurisdiction_area}
                        maxLength={80}
                        placeholder={station?.coverage_area ?? "e.g. Kampala Central Division"}
                        onChange={(e) => set("jurisdiction_area", e.target.value)}
                      />
                    </Field>
                  </>
                )}

                {step === 5 && (
                  <Field label="Official email">
                    <Input
                      type="email"
                      value={draft.official_email}
                      maxLength={120}
                      onChange={(e) => set("official_email", e.target.value)}
                    />
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Dispatch notifications and verification updates are sent here.
                    </p>
                  </Field>
                )}

                {step === 6 && (
                  <div className="space-y-2">
                    {(
                      [
                        ["desktop", "Desktop alerts", "Sound + banner for new incidents"],
                        ["push", "Push notifications", "On mobile devices"],
                        ["email", "Email digest", "Case summaries and assignments"],
                        ["sms", "SMS for critical", "Only for critical dispatches"],
                      ] as const
                    ).map(([key, title, sub]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-secondary/35 px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-medium">{title}</p>
                          <p className="text-[11px] text-muted-foreground">{sub}</p>
                        </div>
                        <Switch
                          checked={draft.prefs[key]}
                          onCheckedChange={(v) => set("prefs", { ...draft.prefs, [key]: v })}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {step === 7 && (
                  <div className="space-y-2">
                    {[
                      ["Officer", draft.full_name || "—"],
                      ["Badge", draft.badge_number || "—"],
                      ["Rank", rankLabel(draft.rank as OfficerRank)],
                      ["Station", station?.name ?? "—"],
                      [
                        "Jurisdiction",
                        `${draft.jurisdiction_level} · ${draft.jurisdiction_area || station?.district || "—"}`,
                      ],
                      ["Contact", `${draft.phone} · ${draft.official_email}`],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex items-start justify-between gap-4 rounded-2xl border border-border/50 bg-secondary/35 px-4 py-3"
                      >
                        <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                          {label}
                        </span>
                        <span className="text-right text-sm font-medium">{value}</span>
                      </div>
                    ))}
                    {isCommandRank(draft.rank as OfficerRank) && (
                      <p className="rounded-2xl border border-gold/35 bg-gold/10 px-4 py-3 text-[11px] text-gold">
                        Command rank selected — you will be able to verify officers, publish alerts
                        and dispatch across your jurisdiction.
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="mt-7 flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                className="rounded-full"
                disabled={step === 0 || submit.isPending}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
              </Button>

              {step < STEPS.length - 1 ? (
                <Button
                  className="rounded-full"
                  disabled={!canAdvance}
                  onClick={() => setStep((s) => s + 1)}
                >
                  Continue <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  className="rounded-full"
                  disabled={submit.isPending}
                  onClick={() => submit.mutate()}
                >
                  {submit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Activate command access
                </Button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
          Restricted system. Unauthorised access or misuse of citizen data is an offence and is
          recorded in the audit trail.
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
