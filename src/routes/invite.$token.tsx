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
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-border/60 bg-card p-6 shadow-lg">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-primary">
          <ShieldCheck className="h-4 w-4" /> ALLMA Safety AI
        </div>

        {invite === undefined && (
          <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        )}

        {invite === null && (
          <div className="py-10 text-center">
            <p className="text-lg font-bold">Invite not found</p>
            <p className="mt-1 text-sm text-muted-foreground">This link isn't valid. Ask the sender for a new one.</p>
          </div>
        )}

        {invite && (
          <>
            <div className="mt-5 flex flex-col items-center text-center">
              <Avatar name={invite.inviter_name} url={invite.inviter_avatar} size={76} />
              <h1 className="mt-3 text-xl font-bold leading-tight">{invite.inviter_name} chose you as an emergency contact</h1>
              <p className="mt-1 text-sm text-muted-foreground">{invite.safety_role} · {tier(invite.priority)}</p>
            </div>

            <ul className="mt-5 space-y-2 rounded-2xl bg-muted/50 p-4 text-[13px]">
              <li className="flex gap-2"><Bell className="h-4 w-4 shrink-0 text-primary" /> You get an alert if they press SOS.</li>
              <li className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-primary" /> You see their location only during an emergency.</li>
              <li className="flex gap-2"><PhoneCall className="h-4 w-4 shrink-0 text-primary" /> They can call you in the app — your number stays private.</li>
            </ul>

            {done === "accepted" ? (
              <div className="mt-6 text-center">
                <p className="font-bold text-success">You're connected</p>
                <p className="mt-1 text-sm text-muted-foreground">{invite.inviter_name} has been notified.</p>
                <Button className="mt-4 w-full rounded-xl" onClick={() => navigate({ to: "/safety-network" })}>Open my Safety Network</Button>
              </div>
            ) : done === "declined" ? (
              <p className="mt-6 text-center text-sm text-muted-foreground">You declined this invite.</p>
            ) : invite.is_own ? (
              <p className="mt-6 rounded-xl bg-muted p-3 text-center text-sm">This is your own invite. Send it to someone on WhatsApp.</p>
            ) : unusable ? (
              <p className="mt-6 rounded-xl bg-muted p-3 text-center text-sm">
                {invite.expired ? "This invite has expired." : "This invite was already used."} Ask {invite.inviter_name} for a new link.
              </p>
            ) : signedIn === false ? (
              <div className="mt-6 space-y-2">
                <Button asChild className="h-12 w-full rounded-xl text-[15px] font-bold">
                  <Link to="/auth" search={{ next }}>Join free & accept</Link>
                </Button>
                <p className="text-center text-[11.5px] text-muted-foreground">Takes 10 seconds — just your name, phone and a PIN.</p>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-2">
                <Button variant="outline" disabled={!!busy || signedIn === null} onClick={() => void respond("decline")} className="h-12 rounded-xl">
                  {busy === "decline" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="mr-1 h-4 w-4" />} Decline
                </Button>
                <Button disabled={!!busy || signedIn === null} onClick={() => void respond("accept")} className="h-12 rounded-xl font-bold">
                  {busy === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Accept
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
