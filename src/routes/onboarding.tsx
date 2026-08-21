import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  HeartHandshake,
  ImagePlus,
  LocateFixed,
  LockKeyhole,
  MapPin,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Shield,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BrandLockup } from "@/components/allma/brand";
import { Mascot } from "@/components/allma/mascot";
import { SafetyNetworkPanel } from "@/components/allma/safety-network/safety-network-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Prepare your safety network — Allma Safety AI" },
      {
        name: "description",
        content:
          "Set up your profile, location preferences and trusted Emergency Circle with Allma.",
      },
    ],
  }),
  component: OnboardingPage,
});

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type CircleMember = {
  id: number;
  name: string;
  relationship: string;
  method: "Allma username" | "Verified phone" | "QR code";
  status: "pending" | "connected";
};

const STEP_LABELS = ["Welcome", "Profile", "Location", "Circle", "Plan", "Health", "Ready"];
const RELATIONSHIPS = [
  "Family",
  "Friend",
  "Neighbor",
  "Partner",
  "Community helper",
  "First aider",
];
const DEFAULT_PLAN = {
  circle: true,
  responders: true,
  services: true,
  location: true,
  calls: true,
  guidance: true,
};

function readDraft() {
  try {
    const value = localStorage.getItem("allma-onboarding-draft");
    return value ? (JSON.parse(value) as Partial<OnboardingDraft>) : {};
  } catch {
    return {};
  }
}

type OnboardingDraft = {
  step: Step;
  name: string;
  phone: string;
  language: string;
  avatar: string;
  location: "unknown" | "allowed" | "declined";
  members: CircleMember[];
  plan: typeof DEFAULT_PLAN;
  locationMode: "approximate" | "exact-after-accept" | "never";
  healthSetup: boolean;
};

const initialDraft: OnboardingDraft = {
  step: 0,
  name: "",
  phone: "",
  language: "English",
  avatar: "",
  location: "unknown",
  members: [],
  plan: DEFAULT_PLAN,
  locationMode: "approximate",
  healthSetup: false,
};

function OnboardingPage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<OnboardingDraft>(initialDraft);
  const [hydrated, setHydrated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [memberName, setMemberName] = useState("");
  const [relationship, setRelationship] = useState("Family");
  const [inviteMethod, setInviteMethod] = useState<CircleMember["method"]>("Allma username");
  const [addingMember, setAddingMember] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      const saved = readDraft();
      const local: OnboardingDraft = {
        ...initialDraft,
        ...saved,
        plan: { ...DEFAULT_PLAN, ...(saved.plan ?? {}) },
        members: saved.members ?? [],
        locationMode: saved.locationMode ?? "approximate",
        healthSetup: saved.healthSetup ?? false,
      };

      const { data: auth } = await supabase.auth.getUser();
      const id = auth.user?.id ?? null;
      if (!active) return;
      setUserId(id);

      if (!id) {
        setDraft(local);
        setHydrated(true);
        return;
      }

      const [{ data: profile }, { data: contacts }] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, phone, avatar_url, locale, onboarding_step, location_mode, safety_plan")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("emergency_contacts")
          .select("id, name, relationship")
          .eq("user_id", id)
          .order("created_at", { ascending: true }),
      ]);
      if (!active) return;

      setDraft({
        ...local,
        step: (Number(profile?.onboarding_step ?? local.step) as Step) ?? 0,
        name: profile?.full_name ?? local.name,
        phone: profile?.phone ?? local.phone,
        avatar: profile?.avatar_url ?? local.avatar,
        language: profile?.locale || local.language,
        locationMode:
          (profile?.location_mode as OnboardingDraft["locationMode"]) ?? local.locationMode,
        plan: { ...DEFAULT_PLAN, ...((profile?.safety_plan as typeof DEFAULT_PLAN | null) ?? {}) },
        members: contacts?.length
          ? contacts.map((contact, index) => ({
              id: index + 1,
              name: contact.name,
              relationship: contact.relationship ?? "Family",
              method: "Allma username" as const,
              status: "pending" as const,
            }))
          : local.members,
      });
      setHydrated(true);
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem("allma-onboarding-draft", JSON.stringify(draft));
  }, [draft, hydrated]);

  // Persist progress to the account whenever the draft changes.
  useEffect(() => {
    if (!hydrated || !userId) return;
    const timer = setTimeout(() => {
      void supabase.from("profiles").upsert({
        id: userId,
        full_name: draft.name.trim() || null,
        phone: draft.phone.trim() || null,
        avatar_url: draft.avatar || null,
        locale: draft.language,
        onboarding_step: draft.step,
        location_mode: draft.locationMode,
        safety_plan: draft.plan,
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [draft, hydrated, userId]);

  async function syncMembers(members: CircleMember[]) {
    if (!userId) return;
    await supabase.from("emergency_contacts").delete().eq("user_id", userId);
    if (!members.length) return;
    await supabase.from("emergency_contacts").insert(
      members.map((member) => ({
        user_id: userId,
        name: member.name,
        phone: "",
        relationship: member.relationship,
      })),
    );
  }

  const step = draft.step;
  const progress = Math.round((step / (STEP_LABELS.length - 1)) * 100);
  const canContinue = step !== 1 || draft.name.trim().length > 1;

  function update(values: Partial<OnboardingDraft>) {
    setDraft((current) => ({ ...current, ...values }));
  }

  function next() {
    if (!canContinue) return;
    update({ step: Math.min(6, step + 1) as Step });
  }

  function back() {
    update({ step: Math.max(0, step - 1) as Step });
  }

  function addMember() {
    const name = memberName.trim();
    if (!name) return;
    const members: CircleMember[] = [
      ...draft.members,
      { id: Date.now(), name, relationship, method: inviteMethod, status: "pending" },
    ];
    update({ members });
    void syncMembers(members);
    setMemberName("");
    setAddingMember(false);
  }

  function moveMember(id: number, direction: -1 | 1) {
    const index = draft.members.findIndex((member) => member.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= draft.members.length) return;
    const members = [...draft.members];
    [members[index], members[nextIndex]] = [members[nextIndex], members[index]];
    update({ members });
    void syncMembers(members);
  }

  function removeMember(id: number) {
    const members = draft.members.filter((member) => member.id !== id);
    update({ members });
    void syncMembers(members);
  }

  function requestLocation() {
    setLocationBusy(true);
    if (!("geolocation" in navigator)) {
      update({ location: "declined" });
      setLocationBusy(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        update({ location: "allowed" });
        setLocationBusy(false);
      },
      () => {
        update({ location: "declined" });
        setLocationBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function finish() {
    localStorage.setItem("allma-onboarding-complete", "true");
    if (!userId) {
      navigate({ to: "/auth", search: { next: "/onboarding" } });
      return;
    }
    await supabase.from("profiles").upsert({
      id: userId,
      full_name: draft.name.trim() || null,
      phone: draft.phone.trim() || null,
      avatar_url: draft.avatar || null,
      locale: draft.language,
      onboarding_step: draft.step,
      location_mode: draft.locationMode,
      safety_plan: draft.plan,
      onboarding_completed: true,
    });
    navigate({ to: draft.healthSetup ? "/health-reminders" : "/chat" });
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <div className="signal-streak pointer-events-none fixed inset-0 -z-10 opacity-70" />
      <header className="border-b border-border/50 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Link to="/">
            <BrandLockup />
          </Link>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <LockKeyhole className="h-3.5 w-3.5 text-success" />
            Your setup is private
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col px-5 pb-12 pt-8 sm:pt-12">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-8">
            <div className="mb-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              <span>Build your safety network</span>
              <span>{String(step + 1).padStart(2, "0")} / 06</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-gold via-primary-glow to-primary"
                animate={{ width: `${Math.max(8, progress)}%` }}
                transition={{ duration: 0.35 }}
              />
            </div>
            <div className="mt-3 hidden grid-cols-6 gap-2 sm:grid">
              {STEP_LABELS.map((label, index) => (
                <div
                  key={label}
                  className={cn(
                    "text-[10px] font-semibold",
                    index <= step ? "text-foreground" : "text-muted-foreground/50",
                  )}
                >
                  <span
                    className={cn(
                      "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
                      index <= step ? "bg-primary" : "bg-muted",
                    )}
                  />
                  {label}
                </div>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={false}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.22 }}
              className="rounded-[2rem] border border-border/60 bg-card/65 p-5 shadow-lift backdrop-blur-xl sm:p-9"
            >
              {step === 0 && <WelcomeStep onNext={next} />}
              {step === 1 && (
                <ProfileStep
                  draft={draft}
                  onChange={update}
                  onNext={next}
                  canContinue={canContinue}
                  onBack={back}
                />
              )}
              {step === 2 && (
                <LocationStep
                  location={draft.location}
                  busy={locationBusy}
                  onAllow={requestLocation}
                  onSkip={() => update({ location: "declined" })}
                  onNext={next}
                  onBack={back}
                />
              )}
              {step === 3 && (
                <CircleStep
                  members={draft.members}
                  signedIn={Boolean(userId)}
                  name={memberName}
                  relationship={relationship}
                  method={inviteMethod}
                  adding={addingMember}
                  onNameChange={setMemberName}
                  onRelationshipChange={setRelationship}
                  onMethodChange={setInviteMethod}
                  onAdd={() => setAddingMember(true)}
                  onCancel={() => setAddingMember(false)}
                  onSave={addMember}
                  onRemove={removeMember}
                  onMove={moveMember}
                  onNext={next}
                  onBack={back}
                />
              )}
              {step === 4 && (
                <PlanStep
                  plan={draft.plan}
                  locationMode={draft.locationMode}
                  onChange={(plan) => update({ plan })}
                  onLocationModeChange={(locationMode) => update({ locationMode })}
                  onNext={next}
                  onBack={back}
                />
              )}
              {step === 5 && <HealthStep enabled={draft.healthSetup} onChange={(healthSetup) => update({ healthSetup })} onNext={next} onBack={back} />}
              {step === 6 && <CompleteStep draft={draft} onFinish={finish} onBack={back} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function StepIntro({
  eyebrow,
  title,
  description,
  icon: Icon = Sparkles,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon?: typeof Sparkles;
}) {
  return (
    <div className="mb-8">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-[2.6rem]">
        {title}
      </h1>
      <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function FooterActions({
  onBack,
  onNext,
  nextLabel = "Continue",
  disabled = false,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-9 flex items-center justify-between gap-3 border-t border-border/50 pt-5">
      {onBack ? (
        <Button variant="ghost" onClick={onBack} className="rounded-full text-muted-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      ) : (
        <span />
      )}
      <Button
        onClick={onNext}
        disabled={disabled}
        className="rounded-full bg-gradient-to-r from-primary to-primary-glow px-6 text-primary-foreground shadow-soft"
      >
        {nextLabel} <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gold/10 blur-3xl" />
      <div className="grid items-center gap-8 sm:grid-cols-[1fr_190px]">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gold">
            <Shield className="h-3.5 w-3.5" /> A calmer plan for emergencies
          </div>
          <h1 className="font-display text-4xl font-black leading-[1.03] tracking-[-0.05em] sm:text-[3.3rem]">
            Welcome to <span className="brand-gradient-text">Allma</span>
          </h1>
          <p className="mt-4 text-lg font-medium text-foreground/85">
            Your intelligent safety assistant.
          </p>
          <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            Allma helps you get the right assistance faster when something goes wrong. Let&apos;s
            prepare the people and preferences that matter.
          </p>
          <Button
            onClick={onNext}
            className="mt-7 rounded-full bg-gradient-to-r from-primary to-primary-glow px-7 text-primary-foreground shadow-lift"
          >
            Get started <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <p className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-success" /> Takes about two minutes · You can change
            this anytime
          </p>
        </div>
        <div className="relative mx-auto hidden sm:block">
          <div className="absolute inset-4 rounded-full bg-primary/15 blur-2xl" />
          <Mascot size={170} priority className="relative" />
          <div className="absolute -bottom-2 -right-2 rounded-2xl border border-border/60 bg-background/85 px-3 py-2 text-[10px] font-semibold shadow-soft backdrop-blur">
            Always here when
            <br />
            <span className="text-primary">you need a steady hand.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileStep({
  draft,
  onChange,
  onNext,
  onBack,
  canContinue,
}: {
  draft: OnboardingDraft;
  onChange: (v: Partial<OnboardingDraft>) => void;
  onNext: () => void;
  onBack: () => void;
  canContinue: boolean;
}) {
  function avatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onChange({ avatar: URL.createObjectURL(file) });
  }
  return (
    <>
      <StepIntro
        eyebrow="01 · Your account"
        title="Let’s start with you."
        description="A little context helps Allma guide you quickly. We only ask for what matters in an emergency."
        icon={UserRound}
      />
      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-border/50 bg-background/40 p-4">
        <label className="relative grid h-16 w-16 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed border-primary/40 bg-primary/10">
          {draft.avatar ? (
            <img src={draft.avatar} alt="Profile preview" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-5 w-5 text-primary" />
          )}
          <input type="file" accept="image/*" onChange={avatar} className="sr-only" />
        </label>
        <div>
          <p className="text-[13px] font-semibold">
            Add a profile photo{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            It helps your trusted circle recognise your requests.
          </p>
        </div>
      </div>
      <div className="space-y-5">
        <div>
          <Label htmlFor="onboarding-name">Full name</Label>
          <Input
            id="onboarding-name"
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="What should we call you?"
            className="mt-2 h-12 rounded-xl bg-background/50"
            autoFocus
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Shown to people you intentionally invite.
          </p>
        </div>
        <div>
          <Label htmlFor="onboarding-phone">
            Phone number <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="onboarding-phone"
            type="tel"
            value={draft.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="+256 700 000 000"
            className="mt-2 h-12 rounded-xl bg-background/50"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Used only for account recovery and emergency settings you approve.
          </p>
        </div>
        <div>
          <Label htmlFor="onboarding-language">Preferred language</Label>
          <div className="relative mt-2">
            <select
              id="onboarding-language"
              value={draft.language}
              onChange={(e) => onChange({ language: e.target.value })}
              className="h-12 w-full appearance-none rounded-xl border border-input bg-background/50 px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option>English</option>
              <option>Luganda</option>
              <option>Swahili</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-4 h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </div>
      <FooterActions onBack={onBack} onNext={onNext} disabled={!canContinue} />
    </>
  );
}

function LocationStep({
  location,
  busy,
  onAllow,
  onSkip,
  onNext,
  onBack,
}: {
  location: OnboardingDraft["location"];
  busy: boolean;
  onAllow: () => void;
  onSkip: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const allowed = location === "allowed";
  return (
    <>
      <StepIntro
        eyebrow="02 · Location"
        title="Help Allma find you when it matters."
        description="Your precise location can help Allma identify nearby assistance during an active emergency."
        icon={LocateFixed}
      />
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border p-5",
          allowed ? "border-success/30 bg-success/5" : "border-border/60 bg-background/40",
        )}
      >
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative flex gap-4">
          <div
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-xl",
              allowed ? "bg-success/15 text-success" : "bg-primary/10 text-primary",
            )}
          >
            {allowed ? <CheckCircle2 className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-[14px] font-bold">
              {allowed ? "Precise location is ready for SOS" : "Location is strongly recommended"}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              Location is <strong className="text-foreground">not continuously shared</strong> with
              other users by default. During an active SOS, it can be shared according to your
              emergency permissions.
            </p>
          </div>
        </div>
      </div>
      {location === "declined" && (
        <p className="mt-4 rounded-xl bg-gold/10 px-4 py-3 text-[12px] text-gold">
          No problem — you can continue. You can enable location later in your Emergency Plan.
        </p>
      )}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button
          onClick={onAllow}
          disabled={busy || allowed}
          className="h-12 flex-1 rounded-xl bg-primary text-primary-foreground"
        >
          <LocateFixed className="mr-2 h-4 w-4" />{" "}
          {busy ? "Checking permission…" : allowed ? "Location allowed" : "Allow precise location"}
        </Button>
        {!allowed && (
          <Button onClick={onSkip} variant="outline" className="h-12 rounded-xl px-6">
            Not now
          </Button>
        )}
      </div>
      <FooterActions onBack={onBack} onNext={onNext} />
    </>
  );
}

function CircleStep({
  members,
  signedIn,
  name,
  relationship,
  method,
  adding,
  onNameChange,
  onRelationshipChange,
  onMethodChange,
  onAdd,
  onCancel,
  onSave,
  onRemove,
  onMove,
  onNext,
  onBack,
}: {
  members: CircleMember[];
  signedIn: boolean;
  name: string;
  relationship: string;
  method: CircleMember["method"];
  adding: boolean;
  onNameChange: (v: string) => void;
  onRelationshipChange: (v: string) => void;
  onMethodChange: (v: CircleMember["method"]) => void;
  onAdd: () => void;
  onCancel: () => void;
  onSave: () => void;
  onRemove: (id: number) => void;
  onMove: (id: number, direction: -1 | 1) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <StepIntro
        eyebrow="03 · Emergency Circle"
        title="Choose people you trust."
        description="These people only become part of your Emergency Circle after they accept your invitation. This is for emergency assistance — not social networking."
        icon={Users}
      />
      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-trusted/20 bg-trusted/5 p-4">
        <HeartHandshake className="mt-0.5 h-5 w-5 shrink-0 text-trusted" />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          If you activate SOS, Allma may contact them through the app depending on the emergency,
          their availability and the permissions they give.
        </p>
      </div>
      {signedIn && (
        <div className="mb-6">
          <SafetyNetworkPanel />
        </div>
      )}
      <div className="mb-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        <span>
          {members.length
            ? `${members.length} contact${members.length > 1 ? "s" : ""} not on Allma`
            : "Contacts not on Allma"}
        </span>
        {members.length > 0 && (
          <span className="flex items-center gap-1 text-trusted">
            <SlidersHorizontal className="h-3 w-3" /> Priority order
          </span>
        )}
      </div>
      <div className="space-y-2">
        {members.map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/45 p-3 transition-colors hover:border-trusted/35"
          >
            <span className="w-4 shrink-0 text-center font-display text-xs font-bold text-muted-foreground/60">
              {members.indexOf(member) + 1}
            </span>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-trusted/30 to-primary/20 text-sm font-bold text-trusted">
              {member.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold">{member.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {member.relationship} · <span className="text-gold">Invitation pending</span>
              </p>
            </div>
            <div className="hidden flex-col items-end gap-1 sm:flex">
              <span className="rounded-full border border-border/60 px-2 py-0.5 text-[9px] text-muted-foreground">
                {member.method}
              </span>
              <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <Clock3 className="h-3 w-3" /> Awaiting acceptance
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                aria-label={`Move ${member.name} up`}
                disabled={members.indexOf(member) === 0}
                onClick={() => onMove(member.id, -1)}
                className="text-muted-foreground disabled:opacity-20"
              >
                <ChevronDown className="h-3.5 w-3.5 rotate-180" />
              </button>
              <button
                type="button"
                aria-label={`Move ${member.name} down`}
                disabled={members.indexOf(member) === members.length - 1}
                onClick={() => onMove(member.id, 1)}
                className="text-muted-foreground disabled:opacity-20"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              aria-label={`Remove ${member.name}`}
              onClick={() => onRemove(member.id)}
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      {adding ? (
        <div className="mt-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[13px] font-bold">Add a trusted person</p>
            <button type="button" onClick={onCancel} aria-label="Cancel">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
            <Input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Their name"
              className="h-11 rounded-xl bg-background/70"
              autoFocus
            />
            <select
              value={relationship}
              onChange={(e) => onRelationshipChange(e.target.value)}
              className="h-11 rounded-xl border border-input bg-background/70 px-3 text-sm"
            >
              {RELATIONSHIPS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-xl border border-border/50 bg-background/35 p-1">
            {(["Allma username", "Verified phone", "QR code"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onMethodChange(item)}
                className={cn(
                  "rounded-lg px-2 py-2 text-[10px] font-semibold transition-colors",
                  method === item
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {item}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            You’ll send an intentional invitation through Allma. Contacts are never added
            automatically, and they are not connected until they accept.
          </p>
          <Button onClick={onSave} disabled={!name.trim()} className="mt-4 rounded-full">
            Send request <ArrowRight className="ml-2 h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/5 py-4 text-[13px] font-bold text-primary transition-colors hover:bg-primary/10"
        >
          <Plus className="h-4 w-4" /> Add trusted person
        </button>
      )}
      {members.length === 0 && !adding && (
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          You can skip this and add people later from your profile.
        </p>
      )}
      <FooterActions onBack={onBack} onNext={onNext} />
    </>
  );
}

function PlanStep({
  plan,
  locationMode,
  onChange,
  onLocationModeChange,
  onNext,
  onBack,
}: {
  plan: typeof DEFAULT_PLAN;
  locationMode: OnboardingDraft["locationMode"];
  onChange: (plan: typeof DEFAULT_PLAN) => void;
  onLocationModeChange: (mode: OnboardingDraft["locationMode"]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const options = useMemo(
    () =>
      [
        [
          "circle",
          "Contact my Emergency Circle",
          "Ask accepted contacts for help when appropriate.",
        ],
        [
          "responders",
          "Find nearby opted-in responders",
          "Only responders who have chosen to be available.",
        ],
        [
          "services",
          "Help contact official emergency services",
          "Prioritise official help for urgent danger.",
        ],
        ["location", "Share location during SOS", "Share according to your location permissions."],
        ["calls", "Allow emergency in-app calls", "Let your circle call you inside Allma."],
        [
          "guidance",
          "Continue AI voice and chat guidance",
          "Keep a calm step-by-step guide with you.",
        ],
      ] as const,
    [],
  );
  return (
    <>
      <StepIntro
        eyebrow="04 · Emergency plan"
        title="Decide what Allma should do."
        description="You’re in control. These preferences guide Allma during SOS, while safety rules always apply — especially in violent or armed emergencies."
        icon={Shield}
      />
      <div className="space-y-2">
        {options.map(([key, title, desc]) => (
          <label
            key={key}
            className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border/50 bg-background/35 p-3.5 transition-colors hover:bg-accent/50"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Check
                className={cn(
                  "h-4 w-4 transition-opacity",
                  plan[key] ? "opacity-100" : "opacity-25",
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{desc}</p>
            </div>
            <Switch
              checked={plan[key]}
              onCheckedChange={(checked) => onChange({ ...plan, [key]: checked })}
            />
          </label>
        ))}
      </div>
      <div className="mt-5 rounded-2xl border border-border/50 bg-background/35 p-4">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-[13px] font-bold">Location sharing during SOS</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Connected people do not receive your exact location automatically. Choose the most
              comfortable starting point.
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {(
            [
              ["approximate", "Approximate first", "Before a responder accepts"],
              ["exact-after-accept", "More precise later", "After accepting your SOS"],
              ["never", "Never share", "Keep location private"],
            ] as const
          ).map(([value, title, desc]) => (
            <button
              key={value}
              type="button"
              onClick={() => onLocationModeChange(value)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                locationMode === value
                  ? "border-primary/50 bg-primary/10"
                  : "border-border/50 bg-background/30 hover:bg-accent/50",
              )}
            >
              <span className="block text-[11px] font-bold">{title}</span>
              <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                {desc}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-start gap-3 rounded-2xl border border-success/20 bg-success/5 p-4">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Your choices are saved on this device. Allma never exposes your private phone number,
          email or exact location unless you explicitly permit it and it is needed for an active
          emergency.
        </p>
      </div>
      <FooterActions onBack={onBack} onNext={onNext} nextLabel="Review setup" />
    </>
  );
}

function HealthStep({ enabled, onChange, onNext, onBack }: { enabled: boolean; onChange: (enabled: boolean) => void; onNext: () => void; onBack: () => void }) {
  return (
    <>
      <StepIntro eyebrow="06 · Optional" title="Your health, on your schedule." description="Allma can help remind you about important health appointments and routines. You can skip this and set it up later from Profile." icon={Clock3} />
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => onChange(true)} className={cn("rounded-2xl border p-5 text-left transition", enabled ? "border-primary bg-primary/10" : "border-border/60 bg-background/40 hover:bg-accent")}><Bell className="h-5 w-5 text-primary" /><p className="mt-3 text-[13px] font-bold">Set up health reminders</p><p className="mt-1 text-[11.5px] text-muted-foreground">Appointments, routines, and follow-ups.</p></button>
        <button type="button" onClick={() => onChange(false)} className={cn("rounded-2xl border p-5 text-left transition", !enabled ? "border-border bg-muted/60" : "border-border/60 bg-background/40 hover:bg-accent")}><X className="h-5 w-5 text-muted-foreground" /><p className="mt-3 text-[13px] font-bold">Not now</p><p className="mt-1 text-[11.5px] text-muted-foreground">You can always add reminders later.</p></button>
      </div>
      <FooterActions onBack={onBack} onNext={onNext} nextLabel="Continue" />
    </>
  );
}

function CompleteStep({
  draft,
  onFinish,
  onBack,
}: {
  draft: OnboardingDraft;
  onFinish: () => void;
  onBack: () => void;
}) {
  const checks = [
    ["Profile", Boolean(draft.name.trim()), UserRound],
    ["Location", draft.location === "allowed", MapPin],
    ["Emergency Circle", draft.members.length > 0, Users],
    ["Emergency permissions", true, LockKeyhole],
    ["Emergency plan", true, Shield],
  ] as const;
  return (
    <>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-success">All set</p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-[2.6rem]">
          Your Emergency Network is ready.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
          Good work. Allma is prepared to guide you calmly and help coordinate the right support if
          you ever need it.
        </p>
      </div>
      <div className="space-y-2">
        {checks.map(([label, complete, Icon]) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background/40 px-4 py-3"
          >
            <span
              className={cn(
                "grid h-8 w-8 place-items-center rounded-full",
                complete ? "bg-success/15 text-success" : "bg-gold/10 text-gold",
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="flex-1 text-[13px] font-semibold">{label}</span>
            <span className={cn("text-[11px] font-bold", complete ? "text-success" : "text-gold")}>
              {complete ? "Ready" : "Recommended"}
            </span>
          </div>
        ))}
      </div>
      {draft.members.length === 0 && (
        <p className="mt-4 rounded-xl bg-gold/10 px-4 py-3 text-[11px] leading-relaxed text-gold">
          Your Emergency Circle is empty for now. You can add trusted people later from your
          profile.
        </p>
      )}
      {draft.location !== "allowed" && (
        <p className="mt-3 rounded-xl bg-gold/10 px-4 py-3 text-[11px] leading-relaxed text-gold">
          Location is not enabled. It is strongly recommended for SOS and can be turned on later.
        </p>
      )}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onBack} className="rounded-full text-muted-foreground">
          Review settings
        </Button>
        <Button
          onClick={onFinish}
          className="rounded-full bg-gradient-to-r from-primary to-primary-glow px-6 text-primary-foreground shadow-lift"
        >
          Enter Allma Safety AI <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
      <p className="mt-5 flex items-center justify-center gap-2 text-center text-[11px] text-muted-foreground">
        <Clock3 className="h-3.5 w-3.5" /> You can edit permissions and circle members anytime.
      </p>
    </>
  );
}
