import { useState } from "react";
import { Bell, Check, Copy, Loader2, Lock, MessageCircle, PhoneCall, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SAFETY_ROLES, createSafetyInvite, inviteText, inviteUrl } from "@/lib/safety-network";

const PRIORITIES = [
  { value: 1, label: "Primary", hint: "Called first when you press SOS", icon: PhoneCall },
  { value: 2, label: "Backup", hint: "Called next if Primary doesn't answer", icon: PhoneCall },
  { value: 3, label: "Additional", hint: "Gets an alert and your location", icon: Bell },
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
export function WhatsAppInvite() {
  const [role, setRole] = useState<string>("Family");
  const [priority, setPriority] = useState(1);
  const [busy, setBusy] = useState<"wa" | "share" | "copy" | null>(null);

  async function makeLink() {
    const token = await createSafetyInvite(role, priority);
    const url = inviteUrl(token);
    return { url, text: inviteText(url, role) };
  }

  async function run(kind: "wa" | "share" | "copy") {
    setBusy(kind);
    // Open the window synchronously so iOS doesn't block it as a popup.
    const win = kind === "wa" ? window.open("about:blank", "_blank") : null;
    try {
      const { url, text } = await makeLink();
      if (kind === "wa") {
        const target = `https://wa.me/?text=${encodeURIComponent(text)}`;
        if (win) win.location.href = target;
        else window.location.href = target;
      } else if (kind === "share" && navigator.share) {
        await navigator.share({ title: "ALLMA Safety AI", text, url }).catch(() => undefined);
      } else {
        await navigator.clipboard.writeText(text);
        toast.success("Invite copied — paste it in any chat");
      }
      toast.message("Invite ready. You'll be notified when they accept.");
    } catch (error) {
      win?.close();
      toast.error(error instanceof Error ? error.message : "Could not create invite");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-5 shadow-lg sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 size-44 rounded-full bg-success/15 blur-3xl" />
      <div className="relative flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-success text-success-foreground shadow-md">
          <MessageCircle className="size-7" />
        </span>
        <div>
          <p className="text-[19px] font-bold leading-tight">Add someone from WhatsApp</p>
          <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
            Send them a link. They tap it and accept — that's it. Works on every phone.
          </p>
        </div>
      </div>

      <StepLabel n={1}>Who are they to you?</StepLabel>
      <div className="mt-3 flex flex-wrap gap-2">
        {SAFETY_ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            aria-pressed={role === r}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] font-semibold transition",
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

      <StepLabel n={3}>Send the invite</StepLabel>
      <Button
        type="button"
        onClick={() => void run("wa")}
        disabled={!!busy}
        className="mt-3 h-14 w-full rounded-2xl bg-success text-[17px] font-bold text-success-foreground shadow-lg hover:bg-success/90"
      >
        {busy === "wa" ? <Loader2 className="mr-2 size-6 animate-spin" /> : <MessageCircle className="mr-2 size-6" />}
        Invite via WhatsApp
      </Button>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" disabled={!!busy} onClick={() => void run("share")} className="h-12 rounded-2xl text-[15px] font-semibold">
          {busy === "share" ? <Loader2 className="mr-2 size-5 animate-spin" /> : <Share2 className="mr-2 size-5" />} Other apps
        </Button>
        <Button type="button" variant="outline" disabled={!!busy} onClick={() => void run("copy")} className="h-12 rounded-2xl text-[15px] font-semibold">
          {busy === "copy" ? <Loader2 className="mr-2 size-5 animate-spin" /> : <Copy className="mr-2 size-5" />} Copy link
        </Button>
      </div>
      <p className="mt-4 flex items-center justify-center gap-2 text-center text-[13px] text-muted-foreground">
        <Lock className="size-4 shrink-0" /> Each link works once and expires in 14 days.
      </p>
    </div>
  );
}
