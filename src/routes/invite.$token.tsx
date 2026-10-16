import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell, Check, Loader2, MapPin, PhoneCall, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { type SafetyInvite, getSafetyInvite, respondToSafetyInvite } from "@/lib/safety-network";
import { Avatar } from "@/components/allma/safety-network/add-safety-contact";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "You've been invited — ALLMA Safety AI" },
      { name: "description", content: "Someone chose you as their emergency contact on ALLMA Safety AI. Accept to receive their SOS alerts." },
      { property: "og:title", content: "You've been chosen as an emergency contact" },
      { property: "og:description", content: "Accept the invite to get their SOS alerts and live location on ALLMA Safety AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitePage,
});

const tier = (p: number) => (p === 1 ? "Primary contact — called first" : p === 2 ? "Backup contact — called next" : "Additional contact — alerted");

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<SafetyInvite | null | undefined>(undefined);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
    getSafetyInvite(token).then(setInvite).catch(() => setInvite(null));
  }, [token]);

  async function respond(action: "accept" | "decline") {
    setBusy(action);
    try {
      const r = await respondToSafetyInvite(token, action);
      setDone(r as "accepted" | "declined");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const next = `/invite/${token}`;
  const unusable = invite && (invite.status !== "pending" || invite.expired);

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute -top-32 left-1/2 size-[28rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative w-full max-w-md rounded-[2rem] border border-border/60 bg-card p-6 shadow-2xl sm:p-8">
        <div className="flex items-center justify-center gap-2 text-[14px] font-bold text-primary">
          <ShieldCheck className="size-5" /> ALLMA Safety AI
        </div>

        {invite === undefined && (
          <div className="grid place-items-center py-20"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
        )}

        {invite === null && (
          <div className="py-12 text-center">
            <p className="text-2xl font-bold">Invite not found</p>
            <p className="mt-2 text-[15px] text-muted-foreground">This link isn't valid. Ask the sender for a new one.</p>
          </div>
        )}

        {invite && (
          <>
            <div className="mt-6 flex flex-col items-center text-center">
              <div className="relative rounded-full p-1 ring-4 ring-primary/25">
                <Avatar name={invite.inviter_name} url={invite.inviter_avatar} size={92} />
                <span className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full border-4 border-card bg-success text-success-foreground">
                  <ShieldCheck className="size-4" />
                </span>
              </div>
              <h1 className="mt-5 text-[24px] font-bold leading-tight">
                {invite.inviter_name} chose you as an emergency contact
              </h1>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <span className="rounded-full bg-primary/10 px-3 py-1.5 text-[14px] font-semibold text-primary">{invite.safety_role}</span>
                <span className="rounded-full bg-muted px-3 py-1.5 text-[14px] font-semibold">{tier(invite.priority)}</span>
              </div>
            </div>

            <p className="mt-7 text-[13px] font-bold uppercase tracking-wide text-muted-foreground">What this means</p>
            <ul className="mt-3 space-y-3">
              {[
                { Icon: Bell, t: "You get an alert", d: "Only if they press SOS." },
                { Icon: MapPin, t: "You see their location", d: "Only during an emergency — never otherwise." },
                { Icon: PhoneCall, t: "They can call you in the app", d: "Your phone number stays private." },
              ].map(({ Icon, t, d }) => (
                <li key={t} className="flex items-start gap-3 rounded-2xl bg-muted/50 p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><Icon className="size-5" /></span>
                  <span>
                    <span className="block text-[15px] font-bold">{t}</span>
                    <span className="block text-[14px] text-muted-foreground">{d}</span>
                  </span>
                </li>
              ))}
            </ul>

            {done === "accepted" ? (
              <div className="mt-7 rounded-2xl bg-success/10 p-5 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-success text-success-foreground"><Check className="size-6" /></span>
                <p className="mt-3 text-[18px] font-bold">You're connected</p>
                <p className="mt-1 text-[15px] text-muted-foreground">{invite.inviter_name} has been notified.</p>
                <Button className="mt-4 h-14 w-full rounded-2xl text-[16px] font-bold" onClick={() => navigate({ to: "/safety-network" })}>Open my Safety Network</Button>
              </div>
            ) : done === "declined" ? (
              <p className="mt-7 rounded-2xl bg-muted p-4 text-center text-[15px] text-muted-foreground">You declined this invite.</p>
            ) : invite.is_own ? (
              <p className="mt-7 rounded-2xl bg-muted p-4 text-center text-[15px]">This is your own invite. Send it to someone on WhatsApp.</p>
            ) : unusable ? (
              <p className="mt-7 rounded-2xl bg-muted p-4 text-center text-[15px]">
                {invite.expired ? "This invite has expired." : "This invite was already used."} Ask {invite.inviter_name} for a new link.
              </p>
            ) : signedIn === false ? (
              <div className="mt-7 space-y-3">
                <Button asChild className="h-14 w-full rounded-2xl text-[17px] font-bold shadow-lg">
                  <Link to="/auth" search={{ next }}>Join free & accept</Link>
                </Button>
                <p className="text-center text-[14px] text-muted-foreground">Takes 10 seconds — just your name, phone and a PIN.</p>
              </div>
            ) : (
              <div className="mt-7 space-y-3">
                <Button disabled={!!busy || signedIn === null} onClick={() => void respond("accept")} className="h-14 w-full rounded-2xl text-[17px] font-bold shadow-lg">
                  {busy === "accept" ? <Loader2 className="mr-2 size-5 animate-spin" /> : <Check className="mr-2 size-5" />} Accept
                </Button>
                <Button variant="outline" disabled={!!busy || signedIn === null} onClick={() => void respond("decline")} className="h-12 w-full rounded-2xl text-[15px]">
                  {busy === "decline" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <X className="mr-2 size-4" />} Decline
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
