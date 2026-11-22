import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BadgeCheck, Check, Loader2, LockKeyhole, Search, Send, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { UG_DIAL_CODE, formatLocalInput, formatPhoneDisplay, isLikelyValidPhone, normalizePhone } from "@/lib/phone";
import { type MemberMatch, inviteMessage, searchMemberByPhone, sendConnectionRequest } from "@/lib/safety-network";
import memberAvatar1 from "@/assets/avatars/member-1.jpg";
import memberAvatar2 from "@/assets/avatars/member-2.jpg";
import memberAvatar3 from "@/assets/avatars/member-3.jpg";
import memberAvatar4 from "@/assets/avatars/member-4.jpg";
import memberAvatar5 from "@/assets/avatars/member-5.jpg";
import memberAvatar6 from "@/assets/avatars/member-6.jpg";
import memberAvatar7 from "@/assets/avatars/member-7.jpg";
import memberAvatar8 from "@/assets/avatars/member-8.jpg";

// Generated stand-in portraits: until a member uploads their own photo,
// each person gets one of these realistic faces — picked by a stable hash
// of their name, so the same person shows the same face everywhere.
const MEMBER_AVATARS = [
  memberAvatar1,
  memberAvatar2,
  memberAvatar3,
  memberAvatar4,
  memberAvatar5,
  memberAvatar6,
  memberAvatar7,
  memberAvatar8,
];

function memberAvatarFor(name: string): string {
  let hash = 0;
  const key = name.trim().toLowerCase();
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return MEMBER_AVATARS[hash % MEMBER_AVATARS.length];
}
import { ImportContacts } from "./import-contacts";
import { WhatsAppInvite } from "./whatsapp-invite";
import { ContactSetupSheet, savePendingSetup } from "./contact-setup-sheet";

type Phase = "idle" | "searching" | "found" | "empty" | "sent";

export function AddSafetyContactDialog({
  open,
  onOpenChange,
  onRequestSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestSent?: () => void;
}) {
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [match, setMatch] = useState<MemberMatch | null>(null);
  const [sending, setSending] = useState(false);
  const [askSetup, setAskSetup] = useState(false);

  function reset() {
    setValue("");
    setPhase("idle");
    setMatch(null);
  }

  const normalized = normalizePhone(value ? `${UG_DIAL_CODE}${value.replace(/\D/g, "")}` : "");
  const canSearch = isLikelyValidPhone(`${UG_DIAL_CODE}${value.replace(/\D/g, "")}`);

  async function search() {
    if (!canSearch || !normalized) return;
    setPhase("searching");
    setMatch(null);
    try {
      const result = await searchMemberByPhone(normalized);
      if (!result) {
        setPhase("empty");
        return;
      }
      setMatch(result);
      setPhase("found");
    } catch (error) {
      setPhase("idle");
      toast.error(error instanceof Error ? error.message : "Search failed");
    }
  }

  async function sendRequest() {
    if (!match) return;
    setSending(true);
    try {
      await sendConnectionRequest(match.user_id);
      setPhase("sent");
      onRequestSent?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send request");
    } finally {
      setSending(false);
    }
  }

  function invite() {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const text = inviteMessage(origin);
    const target = normalized ? normalized.replace(/\D/g, "") : "";
    if (typeof navigator !== "undefined" && navigator.share) {
      void navigator.share({ title: "Join me on Allma", text }).catch(() => undefined);
      return;
    }
    window.location.href = `https://wa.me/${target}?text=${encodeURIComponent(text)}`;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setTimeout(reset, 200);
      }}
    >
      <DialogContent
        className="safety-add-dialog max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-lg gap-0 overflow-y-auto rounded-2xl border-border/60 p-0 sm:w-full"
      >
        <ContactSetupSheet
          contact={askSetup && match ? { name: match.full_name, phone: formatPhoneDisplay(normalized ?? ""), avatar: match.avatar_url, onAllma: true } : null}
          busy={sending}
          onCancel={() => setAskSetup(false)}
          onConfirm={(setup) => {
            if (match) savePendingSetup(match.user_id, setup);
            setAskSetup(false);
            void sendRequest();
          }}
        />
        <DialogHeader className="safety-add-header space-y-2 px-5 pb-5 pt-6 text-left sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-trusted text-trusted-foreground shadow-soft">
              <UserPlus className="h-5 w-5" />
            </div>
            <div><p className="safety-network-kicker">Trusted person</p><DialogTitle className="font-display text-xl font-bold">Add to your Safety Network</DialogTitle></div>
          </div>
          <DialogDescription className="max-w-md text-[12.5px] leading-relaxed">
            Find their Allma account using a Uganda phone number. They must accept before any connection is created.
          </DialogDescription>
          <div className="grid grid-cols-3 gap-1.5 pt-2" aria-label="Connection steps">
            {["Find", "Confirm", "Invite"].map((step, index) => <span key={step} className={cn("rounded-md px-2 py-1.5 text-center text-[10px] font-bold", index === 0 || phase === "found" && index === 1 || phase === "sent" ? "bg-trusted/10 text-trusted" : "bg-muted text-muted-foreground")}>{index + 1}. {step}</span>)}
          </div>
        </DialogHeader>

        <div className="px-5 pb-6 sm:px-6">
          <div
            className={cn(
              "flex items-center gap-2 rounded-2xl border border-border/70 bg-background/60 px-3 transition-colors focus-within:border-primary/60",
              phase === "searching" && "opacity-70",
            )}
          >
            <span className="shrink-0 text-[15px] font-semibold text-muted-foreground">{UG_DIAL_CODE}</span>
            <input
              value={value}
              onChange={(event) => {
                setValue(formatLocalInput(event.target.value));
                if (phase !== "idle") setPhase("idle");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void search();
              }}
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="7XX XXX XXX"
              aria-label="Phone number"
              className="h-13 w-full min-w-0 bg-transparent py-3.5 text-base tracking-[0.04em] outline-none placeholder:text-muted-foreground/50"
            />
          </div>

          <Button
            onClick={() => void search()}
            disabled={!canSearch || phase === "searching"}
            className="mt-3 h-12 w-full rounded-2xl text-[14px] font-bold"
          >
            {phase === "searching" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Search Allma
          </Button>

          <AnimatePresence mode="wait" initial={false}>
            {phase === "searching" && (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-4 flex items-center gap-3 rounded-2xl border border-border/50 bg-background/40 p-4"
              >
                <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </motion.div>
            )}

            {phase === "found" && match && (
              <motion.div
                key="found"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-4 rounded-2xl border border-trusted/25 bg-trusted/5 p-4"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={match.full_name} url={match.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold">{match.full_name}</p>
                    <p className="flex items-center gap-1 text-[11.5px] font-semibold text-trusted">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      {match.phone_verified ? "Verified Allma member" : "Allma member"}
                    </p>
                  </div>
                </div>

                {match.relationship_state === "connected" ? (
                  <p className="mt-4 rounded-xl bg-background/60 p-3 text-[12px] text-muted-foreground">
                    They are already in your safety network.
                  </p>
                ) : match.relationship_state === "request_sent" ? (
                  <p className="mt-4 rounded-xl bg-background/60 p-3 text-[12px] text-muted-foreground">
                    You already have a pending request with them.
                  </p>
                ) : match.relationship_state === "request_received" ? (
                  <p className="mt-4 rounded-xl bg-background/60 p-3 text-[12px] text-muted-foreground">
                    They already sent you a request — check your requests to accept it.
                  </p>
                ) : (
                  <Button
                    onClick={() => setAskSetup(true)}
                    disabled={sending}
                    className="mt-4 h-11 w-full rounded-xl text-[13px] font-bold"
                  >
                    {sending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Send connection request
                  </Button>
                )}
                <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                  Nobody is connected until they accept. You choose their safety role afterwards.
                </p>
              </motion.div>
            )}

            {phase === "empty" && (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-4 rounded-2xl border border-border/60 bg-background/40 p-4 text-center"
              >
                <p className="text-[13px] font-semibold">No Allma account found for this number.</p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {formatPhoneDisplay(normalized ?? "")} isn’t on Allma yet.
                </p>
                <Button onClick={invite} variant="outline" className="mt-4 h-11 w-full rounded-xl text-[13px] font-bold">
                  Invite to Allma
                </Button>
              </motion.div>
            )}

            {phase === "sent" && (
              <motion.div
                key="sent"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="mt-4 rounded-2xl border border-success/25 bg-success/5 p-5 text-center"
              >
                <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-success/15">
                  <Send className="h-5 w-5 text-success" />
                </div>
                <p className="text-[13.5px] font-bold">Invitation request sent</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                  We’ve let {match?.full_name ?? "them"} know. Once they accept, you can set their
                  safety role and emergency permissions.
                </p>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="mt-4 h-11 w-full rounded-xl text-[13px] font-bold"
                >
                  Done
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <span className="h-px flex-1 bg-border/60" /> or <span className="h-px flex-1 bg-border/60" />
          </div>
          <WhatsAppInvite />
          <div className="mt-3" />
          <ImportContacts onRequestSent={onRequestSent} />
          <div className="mt-5 flex items-start gap-2 border-t border-border/60 pt-4 text-[10.5px] leading-relaxed text-muted-foreground"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-trusted" /><span>Their phone number is used only to find the account. It is never displayed in your Safety Network.</span></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Avatar({ name, url, size = 48 }: { name: string; url?: string | null; size?: number }) {
  // Until members upload their own photos, everyone gets a realistic
  // stand-in portrait (see MEMBER_AVATARS above).
  return (
    <img
      src={url ?? memberAvatarFor(name)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}
