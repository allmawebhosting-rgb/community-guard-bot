import { useEffect, useState } from "react";
import { Bell, Check, Copy, Loader2, Lock, MessageCircle, PhoneCall, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SAFETY_ROLES, createSafetyInvite, getSafetyInvite, inviteText, inviteUrl } from "@/lib/safety-network";

type SentInvite = { token: string; role: string; priority: number; via: "wa" | "share" | "copy"; status: "pending" | "accepted" | "declined" | "cancelled"; name?: string };
const SENT_KEY = "allma-sent-invites";
function readSent(): SentInvite[] {
  try { return JSON.parse(sessionStorage.getItem(SENT_KEY) || "[]") as SentInvite[]; } catch { return []; }
}

const PRIORITIES = [
  { value: 1, label: "Primary", hint: "Called first, the moment you press SOS", icon: PhoneCall },
  { value: 2, label: "Backup", hint: "Called at the same time — whoever answers first helps", icon: PhoneCall },
  { value: 3, label: "Additional", hint: "Gets an alert with your live location, no call", icon: Bell },
];

function StepLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="mt-6 flex items-center gap-2.5">
      <span className="grid size-7 place-items-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">{n}</span>
      <p className="text-[16px] font-bold">{children}</p>
    </div>
  );
}

/** Sends a personal Safety Network invite link through WhatsApp (or any app). */
export function WhatsAppInvite({ flat = false }: { flat?: boolean } = {}) {
  const [role, setRole] = useState<string>("Family");
  const [priority, setPriority] = useState(1);
  const [busy, setBusy] = useState<"wa" | "share" | "copy" | null>(null);
  const [sent, setSent] = useState<SentInvite[]>([]);
  const [composing, setComposing] = useState(true);

  useEffect(() => {
    if (!flat) return;
    const saved = readSent();
    setSent(saved);
    if (saved.length) setComposing(false);
  }, [flat]);

  useEffect(() => {
    if (flat) sessionStorage.setItem(SENT_KEY, JSON.stringify(sent));
  }, [flat, sent]);

  // Check real invite status from the backend so "Connected" only shows once they accept.
  useEffect(() => {
    if (!flat || !sent.some((i) => i.status === "pending")) return;
    let alive = true;
    const check = async () => {
      const next = await Promise.all(
        sent.map(async (i) => {
          if (i.status !== "pending") return i;
          try {
            const row = await getSafetyInvite(i.token);
            if (!row) return i;
            if (row.status !== i.status && row.status === "accepted") toast.success("Your contact accepted — they're in your Safety Circle");
            return { ...i, status: row.status };
          } catch { return i; }
        }),
      );
      if (alive && next.some((n, k) => n.status !== sent[k].status)) setSent(next);
    };
    const id = window.setInterval(check, 6000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { alive = false; window.clearInterval(id); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [flat, sent]);

  async function makeLink() {
    const token = await createSafetyInvite(role, priority);
    const url = inviteUrl(token);
    return { token, url, text: inviteText(url, role) };
  }

  async function run(kind: "wa" | "share" | "copy") {
    setBusy(kind);
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints ?? 0) > 1 || window.matchMedia?.("(pointer: coarse)").matches;
    // Desktop only: pre-open a tab synchronously so the popup isn't blocked.
    // On phones we navigate the current tab, which hands off to WhatsApp and
    // leaves Allma in place (no orphaned about:blank tab on return).
    const win = kind === "wa" && !isMobile ? window.open("", "_blank") : null;
    try {
      const { token, url, text } = await makeLink();
      if (kind === "wa") {
        const target = `https://wa.me/?text=${encodeURIComponent(text)}`;
        if (win) {
          win.opener = null;
          win.location.href = target;
        } else {
          window.location.href = isMobile ? `whatsapp://send?text=${encodeURIComponent(text)}` : target;
        }
      } else if (kind === "share" && navigator.share) {
        await navigator.share({ title: "ALLMA Safety AI", text, url }).catch(() => undefined);
      } else {
        await navigator.clipboard.writeText(text);
        toast.success("Invite copied — paste it in any chat");
      }
      if (flat) {
        setSent((prev) => [{ token, role, priority, via: kind, status: "pending" }, ...prev]);
        setComposing(false);
      } else {
        toast.message("Invite ready. You'll be notified when they accept.");
      }
    } catch (error) {
      win?.close();
      toast.error(error instanceof Error ? error.message : "Could not create invite");
    } finally {
      setBusy(null);
    }
  }

  if (flat && !composing && sent.length > 0) {
    return <SentReceipt sent={sent} onAnother={() => { setComposing(true); setPriority(2); }} />;
  }

  return (
    <div className={cn("relative", !flat && "overflow-hidden rounded-3xl border border-border/60 bg-card p-5 shadow-lg sm:p-6")}>
      {!flat && <div className="pointer-events-none absolute -right-16 -top-16 size-44 rounded-full bg-success/15 blur-3xl" />}
      {!flat && <div className="relative flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-success text-success-foreground shadow-md">
          <MessageCircle className="size-7" />
        </span>
        <div>
          <p className="text-[19px] font-bold leading-tight">Add someone from WhatsApp</p>
          <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
            Send them a link. They tap it and accept — that's it. Works on every phone.
          </p>
        </div>
      </div>}

      {flat ? <p className="text-[13px] font-semibold text-muted-foreground">Who are they to you?</p> : <StepLabel n={1}>Who are they to you?</StepLabel>}
      <div className="mt-3 flex flex-wrap gap-2">
        {SAFETY_ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            aria-pressed={role === r}
            className={cn(
              flat ? "inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold transition" : "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] font-semibold transition",
              role === r
                ? "border-primary bg-primary text-primary-foreground shadow-md"
                : "border-border bg-background hover:border-primary/40 hover:bg-muted",
            )}
          >
            {role === r && <Check className="size-4" />}
            {r}
          </button>
        ))}
      </div>

      {flat ? (
        <>
          <p className="mt-3 text-[13px] font-semibold text-muted-foreground">What should Allma do in an SOS?</p>
          <div role="radiogroup" className="mt-2 grid grid-cols-3 gap-1 rounded-full bg-muted/60 p-1">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={priority === p.value}
                onClick={() => setPriority(p.value)}
                className={cn(
                  "h-9 rounded-full text-[13px] font-semibold transition",
                  priority === p.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-2 rounded-xl bg-primary/5 px-3 py-2 text-[12px] text-foreground/80">{PRIORITIES.find((p) => p.value === priority)?.hint}</p>
        </>
      ) : (
        <>
      <StepLabel n={2}>What happens in an emergency?</StepLabel>
      <div className="mt-3 space-y-2.5">
        {PRIORITIES.map((p) => {
          const active = priority === p.value;
          const Icon = p.icon;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => setPriority(p.value)}
              aria-pressed={active}
              className={cn(
                "flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition",
                active ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:bg-muted",
              )}
            >
              <span
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-xl text-[17px] font-black",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {p.value}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-bold">{p.label}</span>
                <span className="block text-[14px] leading-snug text-muted-foreground">{p.hint}</span>
              </span>
              {active ? (
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-4" />
                </span>
              ) : (
                <Icon className="size-5 shrink-0 text-muted-foreground" />
              )}
            </button>
          );
        })}
      </div>

        </>
      )}

      {!flat && <StepLabel n={3}>Send the invite</StepLabel>}
      <Button
        type="button"
        onClick={() => void run("wa")}
        disabled={!!busy}
        className={cn(flat ? "mt-4 h-12" : "mt-3 h-14", " w-full rounded-2xl bg-success text-[17px] font-bold text-success-foreground shadow-lg hover:bg-success/90")}
      >
        {busy === "wa" ? <Loader2 className="mr-2 size-6 animate-spin" /> : <MessageCircle className="mr-2 size-6" />}
        Invite via WhatsApp
      </Button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button type="button" variant="ghost" disabled={!!busy} onClick={() => void run("share")} className="h-11 rounded-2xl text-[15px] font-semibold">
          {busy === "share" ? <Loader2 className="mr-2 size-5 animate-spin" /> : <Share2 className="mr-2 size-5" />} Other apps
        </Button>
        <Button type="button" variant="ghost" disabled={!!busy} onClick={() => void run("copy")} className="h-11 rounded-2xl text-[15px] font-semibold">
          {busy === "copy" ? <Loader2 className="mr-2 size-5 animate-spin" /> : <Copy className="mr-2 size-5" />} Copy link
        </Button>
      </div>
      <p className="mt-3 flex items-center justify-center gap-2 text-center text-[12px] text-muted-foreground">
        <Lock className="size-4 shrink-0" /> Each link works once and expires in 14 days.
      </p>
    </div>
  );
}

const PRIORITY_NAME: Record<number, string> = { 1: "Primary", 2: "Backup", 3: "Additional" };
const VIA_NAME = { wa: "WhatsApp", share: "your chat app", copy: "a copied link" } as const;

function SentReceipt({ sent, onAnother }: { sent: SentInvite[]; onAnother: () => void }) {
  const pending = sent.filter((i) => i.status === "pending").length;
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-full bg-success/15 text-success"><Check className="size-4" /></span>
        <p className="text-[15px] font-bold">
          {sent.length === 1 ? "Invite sent" : `${sent.length} invites sent`}
        </p>
      </div>
      <ul className="mt-3 space-y-2">
        {sent.map((i) => (
          <li key={i.token} className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/60 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold">{i.role} · {PRIORITY_NAME[i.priority] ?? "Contact"}</p>
              <p className="text-[12px] text-muted-foreground">Sent on {VIA_NAME[i.via]}</p>
            </div>
            <span className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
              i.status === "accepted" ? "bg-success/15 text-success" : i.status === "pending" ? "bg-gold/15 text-gold" : "bg-muted text-muted-foreground",
            )}>
              {i.status === "accepted" ? "Connected" : i.status === "pending" ? "Waiting to accept" : i.status === "declined" ? "Declined" : "Cancelled"}
            </span>
          </li>
        ))}
      </ul>
      {pending > 0 && (
        <p className="mt-3 rounded-xl bg-primary/5 px-3 py-2 text-[12px] leading-relaxed text-foreground/80">
          You don't need to wait. Finish setup now — when they tap your link and accept, they join your Safety Circle automatically.
        </p>
      )}
      <Button type="button" variant="outline" onClick={onAnother} className="mt-3 h-10 w-full rounded-full text-[13px] font-semibold">
        + Invite another person
      </Button>
    </div>
  );
}
