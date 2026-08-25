import { useMemo, useState } from "react";
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
  ChevronRight,
  FileText,
  Globe2,
  IdCard,
  Loader2,
  Mail,
  MapPinned,
  Shield,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { RANKS, isCommandRank, rankLabel, stationsQuery, type OfficerRank } from "@/lib/police";
import { cn } from "@/lib/utils";

type Phase = "landing" | "request" | "verification" | "role" | "area" | "security" | "review" | "submitted" | "demo";

type Draft = {
  full_name: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  organization: string;
  organization_type: string;
  job_title: string;
  reason: string;
  org_name: string;
  org_website: string;
  org_email: string;
  org_address: string;
  org_id: string;
  supervisor: string;
  verification_reason: string;
  role: string;
  region: string;
  district: string;
  operating_area: string;
  password: string;
  email_verified: boolean;
  phone_verified: boolean;
  tfa_method: "authenticator" | "sms" | "both";
  use_biometric: boolean;
  access_level: string;
};

const ROLE_OPTIONS = [
  { value: "Command Operator", brief: "Monitor incoming incidents and review operational information." },
  { value: "Incident Reviewer", brief: "Review reported activity and verify the status of cases." },
  { value: "Dispatcher", brief: "Coordinate available responders and resources." },
  { value: "Responder", brief: "Receive and respond to eligible safety requests." },
  { value: "Supervisor", brief: "Review operations, incidents, and team activity." },
  { value: "Administrator", brief: "Manage users, permissions, and system configuration." },
  { value: "Partner Viewer", brief: "View approved information shared with your organization." },
  { value: "Analyst", brief: "Review aggregated operational information and reports." },
];

const ORG_TYPES = [
  "Allma Team",
  "Government",
  "Police / Law Enforcement",
  "Emergency Medical Service",
  "Fire & Rescue",
  "Hospital / Healthcare",
  "NGO / Humanitarian Organization",
  "Security Organization",
  "Community Safety Organization",
  "Corporate / Private Organization",
  "Other",
];

const SECURITY_OPTIONS = [
  { value: "authenticator", label: "Authenticator app" },
  { value: "sms", label: "SMS verification" },
  { value: "both", label: "Authenticator + SMS" },
];

const DEMO_EVENTS = [
  "SOS received",
  "Incident created",
  "AI summary",
  "Responder assignment",
  "Dispatch simulation",
  "Communication simulation",
  "Incident resolution",
];

const JURISDICTIONS = ["Country", "Region", "District", "City", "Operating area"];

function generateApplicationId() {
  return `ALLMA-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 8999))}`;
}

export function OnboardingWizard({ userId, email }: { userId: string; email: string }) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("landing");
  const [applicationId] = useState(generateApplicationId());
  const [submittedAt] = useState(new Date().toISOString());
  const {
    data: stations = [],
    isLoading: stationsLoading,
    isError: stationsError,
  } = useQuery(stationsQuery);
  const [draft, setDraft] = useState<Draft>({
    full_name: "",
    email,
    phone: "",
    country: "Uganda",
    city: "",
    organization: "",
    organization_type: "Allma Team",
    job_title: "",
    reason: "",
    org_name: "",
    org_website: "",
    org_email: "",
    org_address: "",
    org_id: "",
    supervisor: "",
    verification_reason: "",
    role: "Command Operator",
    region: "",
    district: "",
    operating_area: "",
    password: "",
    email_verified: false,
    phone_verified: false,
    tfa_method: "authenticator",
    use_biometric: false,
    access_level: "LEVEL 2 — OPERATOR",
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const station = stations.find((s) => s.id === draft.org_name || s.name === draft.org_name) ?? null;

  const canContinue = useMemo(() => {
    if (phase === "request") {
      return (
        draft.full_name.trim().length > 2 &&
        /.+@.+\..+/.test(draft.email) &&
        draft.phone.trim().length > 6 &&
        draft.organization.trim().length > 2 &&
        draft.job_title.trim().length > 2
      );
    }
    if (phase === "verification") {
      return (
        draft.org_name.trim().length > 2 &&
        draft.org_email.trim().length > 0 &&
        draft.supervisor.trim().length > 2
      );
    }
    if (phase === "role") {
      return Boolean(draft.role);
    }
    if (phase === "area") {
      return draft.country.trim().length > 1 && draft.operating_area.trim().length > 1;
    }
    if (phase === "security") {
      return draft.password.length >= 8 && draft.email_verified && draft.phone_verified;
    }
    return true;
  }, [draft, phase]);

  const submit = useMutation({
    mutationFn: async () => {
      const rankMap: Record<string, OfficerRank> = {
        "Command Operator": "operations_officer",
        "Incident Reviewer": "investigator",
        "Dispatcher": "dispatch_officer",
        "Responder": "community_liaison_officer",
        "Supervisor": "station_commander",
        "Administrator": "system_administrator",
        "Partner Viewer": "read_only",
        "Analyst": "read_only",
      };

      const { count } = await supabase
        .from("officer_profiles")
        .select("id", { count: "exact", head: true })
        .eq("status", "verified");
      const bootstrap = (count ?? 0) === 0;

      const defaultStation = stations[0]?.id ?? null;
      const { error } = await supabase.from("officer_profiles").upsert(
        {
          user_id: userId,
          full_name: draft.full_name.trim(),
          phone: draft.phone.trim(),
          badge_number: "ACCESS-REQUEST",
          force_id: draft.org_id.trim() || null,
          rank: rankMap[draft.role] ?? "operations_officer",
          station_id: defaultStation,
          jurisdiction_level: "Regional",
          jurisdiction_area: draft.operating_area.trim() || draft.city || draft.district || draft.country,
          official_email: draft.email.trim(),
          notification_prefs: {
            desktop: true,
            sms: draft.tfa_method === "sms" || draft.tfa_method === "both",
            email: true,
            push: true,
            scope: "critical",
          },
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
      toast.success(bootstrap ? "Access activated" : "Access request submitted");
      qc.invalidateQueries({ queryKey: ["officer", "me"] });
      setPhase("submitted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const progress = (() => {
    const phases = ["landing", "request", "verification", "role", "area", "security", "review", "submitted"];
    const idx = phases.indexOf(phase);
    if (idx <= 0) return 8;
    return ((idx + 1) / phases.length) * 100;
  })();

  if (phase === "demo") {
    return (
      <div className="signal-streak min-h-screen px-4 py-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold">DEMO SIMULATION</p>
              <h1 className="mt-2 font-display text-2xl font-semibold">Allma Operations Center</h1>
            </div>
            <div className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
              Simulated workspace
            </div>
          </div>
          <div className="premium-surface rounded-3xl border border-border/60 p-6 shadow-lift">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Needs attention</div>
                <div className="mt-3 font-display text-3xl font-semibold text-primary">03</div>
              </div>
              <div className="rounded-2xl border border-gold/35 bg-gold/10 p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Unassigned</div>
                <div className="mt-3 font-display text-3xl font-semibold text-gold">02</div>
              </div>
              <div className="rounded-2xl border border-success/35 bg-success/10 p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Resolved today</div>
                <div className="mt-3 font-display text-3xl font-semibold text-success">07</div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-border/60 bg-secondary/40 p-4">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">SIMULATED INCIDENT FLOW</div>
              <div className="flex flex-wrap gap-2">
                {DEMO_EVENTS.map((event) => (
                  <span key={event} className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1.5 text-[10px] text-muted-foreground">
                    {event}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-border/60 bg-secondary/40 p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Current case</div>
                <div className="mt-2 font-semibold text-foreground">DEMO INCIDENT #UG-DEMO-001</div>
                <p className="mt-2 text-sm text-muted-foreground">SIMULATED: An incident has been received and a human operator is reviewing the summary.</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-secondary/40 p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">AI summary</div>
                <div className="mt-2 font-semibold text-foreground">Advisory only</div>
                <p className="mt-2 text-sm text-muted-foreground">Allma AI provides operational observations. Human decisions remain responsible for any action.</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button className="rounded-full" onClick={() => setPhase("landing")}>Back to entry</Button>
              <Button variant="secondary" className="rounded-full" onClick={() => setPhase("submitted")}>Enter demo workspace</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="signal-streak min-h-screen px-4 py-8">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow shadow-lift">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold tracking-tight">ALLMA</p>
            <p className="text-[11px] text-muted-foreground">Safety Operations Center</p>
          </div>
        </div>

        <div className="premium-surface overflow-hidden rounded-3xl border border-border/60 shadow-lift">
          {phase !== "landing" && phase !== "submitted" && (
            <div className="h-1 w-full bg-border/40">
              <motion.div
                className="h-full bg-gradient-to-r from-primary via-primary-glow to-gold"
                animate={{ width: `${progress}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
            </div>
          )}

          <div className="p-6">
            {phase === "landing" && (
              <div className="space-y-6">
                <div className="space-y-2 text-center">
                  <div className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                    Private Platform • Authorized Access Required
                  </div>
                  <h1 className="font-display text-3xl font-black tracking-[-0.04em]">ALLMA</h1>
                  <p className="text-lg font-medium text-foreground">Safety Operations Center</p>
                  <p className="text-sm text-muted-foreground">Secure access for authorized safety operations.</p>
                </div>

                <div className="rounded-2xl border border-border/60 bg-secondary/40 p-4 text-sm leading-relaxed text-muted-foreground">
                  Allma connects people who need help with trusted networks, responders, and safety resources. Command Center access is restricted to authorized users.
                </div>

                <div className="space-y-3">
                  <Button className="w-full rounded-full" onClick={() => setPhase("request")}>Request Access</Button>
                  <Button variant="secondary" className="w-full rounded-full" onClick={() => setPhase("security")}>Sign In</Button>
                  <Button variant="ghost" className="w-full rounded-full" onClick={() => setPhase("demo")}>Explore Demo</Button>
                </div>
              </div>
            )}

            {phase === "request" && (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Request Command Center Access</p>
                  <h2 className="mt-2 font-display text-xl font-semibold">Tell us who you are and how you intend to use Allma.</h2>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Full name"><Input value={draft.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Your full name" /></Field>
                  <Field label="Email"><Input type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} placeholder="name@company.org" /></Field>
                  <Field label="Phone number"><Input value={draft.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+256..." /></Field>
                  <Field label="Country"><Input value={draft.country} onChange={(e) => set("country", e.target.value)} /></Field>
                  <Field label="City / District"><Input value={draft.city} onChange={(e) => set("city", e.target.value)} /></Field>
                  <Field label="Organization"><Input value={draft.organization} onChange={(e) => set("organization", e.target.value)} placeholder="Organization or team name" /></Field>
                </div>

                <Field label="Organization type">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {ORG_TYPES.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => set("organization_type", option)}
                        className={cn(
                          "rounded-2xl border px-3 py-2 text-left text-sm transition",
                          draft.organization_type === option ? "border-primary/60 bg-primary/10 text-foreground" : "border-border/50 bg-secondary/35 text-muted-foreground"
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </Field>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Job title / role"><Input value={draft.job_title} onChange={(e) => set("job_title", e.target.value)} /></Field>
                  <Field label="Reason for requesting access"><Input value={draft.reason} onChange={(e) => set("reason", e.target.value)} /></Field>
                </div>

                <div className="flex justify-between gap-3 pt-2">
                  <Button variant="ghost" className="rounded-full" onClick={() => setPhase("landing")}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Button>
                  <Button className="rounded-full" disabled={!canContinue} onClick={() => setPhase("verification")}>Continue <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
                </div>
              </div>
            )}

            {phase === "verification" && (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Verify your organization</p>
                  <h2 className="mt-2 font-display text-xl font-semibold">Confirm your organization details and authorization.</h2>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Organization name"><Input value={draft.org_name} onChange={(e) => set("org_name", e.target.value)} /></Field>
                  <Field label="Organization website"><Input value={draft.org_website} onChange={(e) => set("org_website", e.target.value)} placeholder="https://example.org" /></Field>
                  <Field label="Official organization email"><Input value={draft.org_email} onChange={(e) => set("org_email", e.target.value)} placeholder="security@org.org" /></Field>
                  <Field label="Organization ID / registration"><Input value={draft.org_id} onChange={(e) => set("org_id", e.target.value)} placeholder="Where applicable" /></Field>
                </div>

                <Field label="Organization address"><Input value={draft.org_address} onChange={(e) => set("org_address", e.target.value)} /></Field>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Supervisor / contact person"><Input value={draft.supervisor} onChange={(e) => set("supervisor", e.target.value)} /></Field>
                  <Field label="Reason for access"><Input value={draft.verification_reason} onChange={(e) => set("verification_reason", e.target.value)} /></Field>
                </div>

                <div className="rounded-2xl border border-border/60 bg-secondary/40 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground"><FileText className="h-4 w-4 text-gold" /> Supporting documents</div>
                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <span>• Organization identification</span>
                    <span>• Authorization letter</span>
                    <span>• Staff identification</span>
                    <span>• Partnership documentation</span>
                  </div>
                  <p className="mt-3 text-[11px] text-muted-foreground">Documents are reviewed securely and are used only for access verification.</p>
                </div>

                <div className="flex justify-between gap-3 pt-2">
                  <Button variant="ghost" className="rounded-full" onClick={() => setPhase("request")}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Button>
                  <Button className="rounded-full" disabled={!canContinue} onClick={() => setPhase("role")}>Continue <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
                </div>
              </div>
            )}

            {phase === "role" && (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Role selection</p>
                  <h2 className="mt-2 font-display text-xl font-semibold">What will you do in Allma?</h2>
                </div>

                <div className="space-y-2">
                  {ROLE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => set("role", option.value)}
                      className={cn(
                        "flex w-full items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition",
                        draft.role === option.value ? "border-primary/60 bg-primary/10" : "border-border/50 bg-secondary/35"
                      )}
                    >
                      <div>
                        <div className="text-sm font-medium text-foreground">{option.value}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">{option.brief}</div>
                      </div>
                      {draft.role === option.value && <Check className="mt-1 h-4 w-4 text-primary" />}
                    </button>
                  ))}
                </div>

                <div className="flex justify-between gap-3 pt-2">
                  <Button variant="ghost" className="rounded-full" onClick={() => setPhase("verification")}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Button>
                  <Button className="rounded-full" disabled={!canContinue} onClick={() => setPhase("area")}>Continue <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
                </div>
              </div>
            )}

            {phase === "area" && (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Jurisdiction / operating area</p>
                  <h2 className="mt-2 font-display text-xl font-semibold">Where will you operate?</h2>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Country"><Input value={draft.country} onChange={(e) => set("country", e.target.value)} /></Field>
                  <Field label="Region"><Input value={draft.region} onChange={(e) => set("region", e.target.value)} /></Field>
                  <Field label="District"><Input value={draft.district} onChange={(e) => set("district", e.target.value)} /></Field>
                  <Field label="City"><Input value={draft.city} onChange={(e) => set("city", e.target.value)} /></Field>
                </div>

                <Field label="Operating area"><Input value={draft.operating_area} onChange={(e) => set("operating_area", e.target.value)} placeholder="e.g. Wairaka, Jinja" /></Field>
                <p className="text-[11px] text-muted-foreground">Your operating area determines which incidents and resources you may be authorized to access.</p>

                <div className="flex justify-between gap-3 pt-2">
                  <Button variant="ghost" className="rounded-full" onClick={() => setPhase("role")}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Button>
                  <Button className="rounded-full" disabled={!canContinue} onClick={() => setPhase("security")}>Continue <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
                </div>
              </div>
            )}

            {phase === "security" && (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Security setup</p>
                  <h2 className="mt-2 font-display text-xl font-semibold">Protect the account before access is granted.</h2>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-secondary/35 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">Email verification</div>
                      <div className="text-[11px] text-muted-foreground">Confirm your primary account email</div>
                    </div>
                    <Switch checked={draft.email_verified} onCheckedChange={(v) => set("email_verified", v)} />
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-secondary/35 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">Phone verification</div>
                      <div className="text-[11px] text-muted-foreground">Confirm mobile access and recovery</div>
                    </div>
                    <Switch checked={draft.phone_verified} onCheckedChange={(v) => set("phone_verified", v)} />
                  </div>
                </div>

                <Field label="Strong password"><Input type="password" value={draft.password} onChange={(e) => set("password", e.target.value)} placeholder="Create a strong password" /></Field>

                <Field label="Two-factor authentication">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {SECURITY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => set("tfa_method", option.value as Draft["tfa_method"])}
                        className={cn(
                          "rounded-2xl border px-3 py-2 text-sm transition",
                          draft.tfa_method === option.value ? "border-primary/60 bg-primary/10 text-foreground" : "border-border/50 bg-secondary/35 text-muted-foreground"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </Field>

                <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-secondary/35 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">Use Face ID / device authentication</div>
                    <div className="text-[11px] text-muted-foreground">Available on supported devices only</div>
                  </div>
                  <Switch checked={draft.use_biometric} onCheckedChange={(v) => set("use_biometric", v)} />
                </div>

                <div className="flex justify-between gap-3 pt-2">
                  <Button variant="ghost" className="rounded-full" onClick={() => setPhase("area")}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Button>
                  <Button className="rounded-full" disabled={!canContinue} onClick={() => setPhase("review")}>Review access <ChevronRight className="ml-1.5 h-4 w-4" /></Button>
                </div>
              </div>
            )}

            {phase === "review" && (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Access review</p>
                  <h2 className="mt-2 font-display text-xl font-semibold">Confirm your application before submission.</h2>
                </div>

                <div className="space-y-2 rounded-2xl border border-border/60 bg-secondary/35 p-4">
                  {[
                    ["Applicant", draft.full_name],
                    ["Organization", draft.org_name || draft.organization],
                    ["Role", draft.role],
                    ["Location", `${draft.country} / ${draft.region || draft.district || draft.city || draft.operating_area}`],
                    ["Access Level", draft.access_level],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                      <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
                      <span className="text-right text-sm font-medium text-foreground">{value}</span>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-gold/35 bg-gold/10 p-4 text-[11px] leading-relaxed text-gold">
                  Command Center contains sensitive operational information. By continuing, you agree to use information only for authorized purposes, protect incident data, and follow Allma operational and privacy policies.
                </div>

                <div className="flex justify-between gap-3 pt-2">
                  <Button variant="ghost" className="rounded-full" onClick={() => setPhase("security")}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Button>
                  <Button className="rounded-full" disabled={submit.isPending} onClick={() => void submit.mutate()}>
                    {submit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Submit request
                  </Button>
                </div>
              </div>
            )}

            {phase === "submitted" && (
              <div className="space-y-5 text-center">
                <div className="inline-flex rounded-full border border-success/35 bg-success/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-success">
                  Access request submitted
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">PENDING REVIEW</p>
                  <h2 className="mt-2 font-display text-2xl font-semibold">Your request is being reviewed.</h2>
                </div>

                <div className="grid gap-3 text-left sm:grid-cols-2">
                  <InfoRow label="Application ID" value={applicationId} />
                  <InfoRow label="Submitted" value={new Date(submittedAt).toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" })} />
                  <InfoRow label="Organization" value={draft.org_name || draft.organization} />
                  <InfoRow label="Requested role" value={draft.role} />
                  <InfoRow label="Operating area" value={draft.operating_area || `${draft.country} / ${draft.city || draft.district || "Region"}`} />
                  <InfoRow label="Status" value="Pending Review" />
                </div>

                <div className="rounded-2xl border border-border/60 bg-secondary/35 p-4 text-sm text-muted-foreground">
                  You will receive an email when your access status changes. Until then, you may continue exploring the Allma demo environment.
                </div>

                <div className="flex flex-wrap justify-center gap-3">
                  <Button className="rounded-full" onClick={() => setPhase("landing")}>Return to start</Button>
                  <Button variant="secondary" className="rounded-full" onClick={() => setPhase("demo")}>Explore demo</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-secondary/35 px-3 py-2.5 text-sm">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium text-foreground">{value}</div>
    </div>
  );
}
