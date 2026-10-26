import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2, Shield, Siren, Sparkles } from "lucide-react";
import { z } from "zod";
import { BrandLockup } from "@/components/allma/brand";
import { Mascot } from "@/components/allma/mascot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { DISCLAIMER } from "@/lib/allma";
import { resolvePostAuthPath } from "@/lib/onboarding";
import { formatLocalInput, isLikelyValidPhone } from "@/lib/phone";
import { phoneLoginEmail } from "@/lib/phone-auth";
import { signUpWithPhone } from "@/lib/phone-auth.functions";

function PhoneField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Phone number</Label>
      <div className="flex items-center gap-2">
        <span className="flex h-10 items-center rounded-md border border-input shrink-0 whitespace-nowrap bg-muted px-3 text-sm font-medium">UG +256</span>
        <Input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="772 123 456"
          value={formatLocalInput(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { next?: string } =>
    typeof search.next === "string" && search.next.startsWith("/") && !search.next.startsWith("//")
      ? { next: search.next }
      : {},
  head: () => ({
    meta: [
      { title: "Sign in — Allma Safety AI" },
      {
        name: "description",
        content:
          "Sign in to Allma Safety AI to save your reports, emergency history and conversations securely.",
      },
      { property: "og:title", content: "Sign in — Allma Safety AI" },
      {
        property: "og:description",
        content: "Access your Allma Safety AI dashboard, reports and emergency history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

const TRUST_POINTS = [
  { icon: Shield, text: "100% free — no payment required" },
  { icon: Check, text: "Reports encrypted and stored securely" },
  { icon: Siren, text: "Emergency SOS with one press" },
  { icon: Sparkles, text: "AI guides you step by step" },
];

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const goNext = async (userId?: string) => {
    const id = userId ?? (await supabase.auth.getUser()).data.user?.id;
    if (!id) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    const target = await resolvePostAuthPath(id, next);
    if (target === next) window.location.href = target;
    else navigate({ to: target, replace: true });
  };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [useEmail, setUseEmail] = useState(false);
  const [phone, setPhone] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void goNext(data.session.user.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, next]);

  async function signIn() {
    const parsed = credentials.safeParse({ email, password });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) return toast.error(error.message);
    void goNext();
  }

  async function signUp() {
    const parsed = credentials.safeParse({ email, password });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      ...parsed.data,
      options: {
        emailRedirectTo: next ? `${window.location.origin}${next}` : window.location.origin,
        data: { full_name: fullName.trim().slice(0, 80) || null },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if (!data.session) { setCheckEmail(true); return; }
    void goNext(data.session.user.id);
  }

  async function phoneSignIn() {
    if (!isLikelyValidPhone(phone)) return toast.error("Enter a valid phone number.");
    if (password.length < 6) return toast.error("Enter your PIN or password.");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: phoneLoginEmail(phone)!, password });
    setLoading(false);
    if (error) return toast.error("Phone number or PIN is incorrect.");
    void goNext();
  }

  async function phoneSignUp() {
    if (!isLikelyValidPhone(phone)) return toast.error("Enter a valid phone number.");
    if (password.length < 6) return toast.error("Your PIN or password needs at least 6 characters.");
    setLoading(true);
    try {
      const res = await signUpWithPhone({ data: { phone, password, fullName } });
      if (!res.ok) {
        if (res.code === "account_exists") {
          const { error } = await supabase.auth.signInWithPassword({
            email: phoneLoginEmail(phone)!,
            password,
          });
          setLoading(false);
          if (error) {
            return toast.error(
              "This phone number already has an account. Sign in with its existing PIN or password.",
            );
          }
          void goNext();
          return;
        }
        setLoading(false);
        return toast.error(res.error);
      }
      const { error } = await supabase.auth.signInWithPassword({ email: phoneLoginEmail(phone)!, password });
      setLoading(false);
      if (error) return toast.error("Account created. Please sign in.");
      void goNext();
    } catch (e) {
      setLoading(false);
      toast.error(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    }
  }

  async function google() {
    const redirectTo = new URL("/auth", window.location.origin);
    if (next) redirectTo.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo.toString() },
    });
    if (error) toast.error(`Google sign-in failed: ${error.message}`);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="signal-streak pointer-events-none fixed inset-0 -z-10 opacity-60" />

      {/* ── Desktop split layout ─────────────────────────────────────── */}
      <div className="flex min-h-screen lg:flex-row">

        {/* Left hero panel — desktop only */}
        <div className="relative hidden flex-col items-center justify-center overflow-hidden border-r border-border/40 bg-card/40 px-12 py-16 lg:flex lg:w-[52%] xl:w-[55%]">
          <div className="pointer-events-none absolute inset-0 hero-glow opacity-70" />
          <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-primary-glow/10 blur-3xl" />

          <div className="relative z-10 flex max-w-md flex-col items-center text-center">
            <Link to="/" className="mb-8">
              <BrandLockup />
            </Link>

            <div className="relative mb-8">
              <div className="absolute -inset-8 rounded-full bg-gradient-to-br from-primary/20 via-primary-glow/10 to-transparent blur-2xl" />
              <Mascot size={200} priority className="relative z-10" />
            </div>

            <h1 className="font-display text-[2.4rem] font-black leading-[1.05] tracking-[-0.04em]">
              Keep Uganda{" "}
              <span className="brand-gradient-text">safe together</span>
            </h1>

            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
              Sign in to save your reports, track your cases, and get back
              to the people who matter when it counts.
            </p>

            <div className="mt-8 w-full space-y-3">
              {TRUST_POINTS.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background/30 px-4 py-3 backdrop-blur-sm">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                  </span>
                  <span className="text-[13px] font-medium text-foreground/80">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right form panel */}
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 lg:px-12">

          {/* Mobile back link */}
          <div className="mb-6 w-full max-w-sm lg:hidden">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowLeft className="h-4 w-4" /> Back to assistant
            </Link>
          </div>

          <div className="w-full max-w-sm">
            {/* Desktop back link */}
            <Link to="/" className="mb-8 hidden items-center gap-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground lg:inline-flex">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to home
            </Link>

            <div className="rounded-3xl border border-border bg-card p-7 shadow-lift lg:shadow-2xl">
              {/* Mobile brand */}
              <BrandLockup className="mb-6 lg:hidden" />

              <h2 className="hidden font-display text-2xl font-black tracking-[-0.03em] lg:block">
                Welcome back
              </h2>
              <p className="mt-1 hidden text-[13px] text-muted-foreground lg:block">
                Sign in to your account or create a new one.
              </p>

              {checkEmail ? (
                <div className="space-y-3 lg:mt-5">
                  <h1 className="text-lg font-semibold">Confirm your email</h1>
                  <p className="text-sm text-muted-foreground">
                    We sent a confirmation link to <span className="font-medium">{email}</span>. Open it
                    to activate your account, then come back and sign in.
                  </p>
                  <Button variant="outline" className="w-full rounded-full" onClick={() => setCheckEmail(false)}>
                    Back
                  </Button>
                </div>
              ) : useEmail ? (
                <Tabs defaultValue="signin" className="lg:mt-5">
                  <TabsList className="mb-5 grid w-full grid-cols-2 rounded-full">
                    <TabsTrigger value="signin" className="rounded-full">Sign in</TabsTrigger>
                    <TabsTrigger value="signup" className="rounded-full">Create account</TabsTrigger>
                  </TabsList>

                  <TabsContent value="signin" className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="password">Password</Label>
                      <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <Button className="w-full rounded-full" disabled={loading} onClick={signIn}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Sign in <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </TabsContent>

                  <TabsContent value="signup" className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="name">Full name</Label>
                      <Input id="name" value={fullName} maxLength={80} onChange={(e) => setFullName(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input id="signup-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input id="signup-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <Button className="w-full rounded-full" disabled={loading} onClick={signUp}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Create account <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </TabsContent>
                  <button type="button" onClick={() => setUseEmail(false)} className="mt-3 w-full text-center text-[12px] font-medium text-primary">
                    Use my phone number instead
                  </button>
                </Tabs>
              ) : (
                <Tabs defaultValue="signup" className="lg:mt-5">
                  <TabsList className="mb-5 grid w-full grid-cols-2 rounded-full">
                    <TabsTrigger value="signup" className="rounded-full">Join free</TabsTrigger>
                    <TabsTrigger value="signin" className="rounded-full">Sign in</TabsTrigger>
                  </TabsList>
                  <TabsContent value="signup" className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="p-name">Your name</Label>
                      <Input id="p-name" autoComplete="name" value={fullName} maxLength={80} onChange={(e) => setFullName(e.target.value)} />
                    </div>
                    <PhoneField id="p-phone-up" value={phone} onChange={setPhone} />
                    <div className="space-y-1.5">
                      <Label htmlFor="p-pin-up">Create a PIN or password</Label>
                      <Input id="p-pin-up" type="password" inputMode="text" autoComplete="new-password" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <Button className="w-full rounded-full" disabled={loading} onClick={phoneSignUp}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Create my account <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </TabsContent>
                  <TabsContent value="signin" className="space-y-3">
                    <PhoneField id="p-phone-in" value={phone} onChange={setPhone} />
                    <div className="space-y-1.5">
                      <Label htmlFor="p-pin-in">PIN or password</Label>
                      <Input id="p-pin-in" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <Button className="w-full rounded-full" disabled={loading} onClick={phoneSignIn}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Sign in <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </TabsContent>
                  <button type="button" onClick={() => setUseEmail(true)} className="mt-3 w-full text-center text-[12px] font-medium text-primary">
                    Use email instead
                  </button>
                </Tabs>

              )}

              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>

              <Button variant="outline" className="w-full rounded-full" onClick={google}>
                Continue with Google
              </Button>
              <Button variant="ghost" className="mt-2 w-full rounded-full" asChild>
                <Link to="/">Continue as guest</Link>
              </Button>
            </div>

            <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">{DISCLAIMER}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
