import { useState } from "react";
import { Copy, Loader2, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SAFETY_ROLES, createSafetyInvite, inviteText, inviteUrl } from "@/lib/safety-network";

const PRIORITIES = [
  { value: 1, label: "Primary", hint: "Called first" },
  { value: 2, label: "Backup", hint: "Called next" },
  { value: 3, label: "Additional", hint: "Alert only" },
];

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
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/15 text-success">
          <MessageCircle className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[14px] font-bold">Invite from WhatsApp</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            Pick anyone from your WhatsApp chats. They tap the link and accept — works on every phone.
          </p>
        </div>
      </div>

      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Who are they to you?</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SAFETY_ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
              role === r ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
            )}
          >
            {r}
          </button>
        ))}
      </div>

      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">In an emergency</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {PRIORITIES.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPriority(p.value)}
            className={cn(
              "rounded-xl border p-2 text-left transition",
              priority === p.value ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted",
            )}
          >
            <p className="text-[12.5px] font-bold">{p.label}</p>
            <p className="text-[10.5px] text-muted-foreground">{p.hint}</p>
          </button>
        ))}
      </div>

      <Button
        type="button"
        onClick={() => void run("wa")}
        disabled={!!busy}
        className="mt-4 h-12 w-full rounded-xl bg-success text-[14px] font-bold text-success-foreground hover:bg-success/90"
      >
        {busy === "wa" ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <MessageCircle className="mr-2 h-5 w-5" />}
        Invite via WhatsApp
      </Button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" disabled={!!busy} onClick={() => void run("share")} className="rounded-xl">
          {busy === "share" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Share2 className="mr-1.5 h-4 w-4" />} Share
        </Button>
        <Button type="button" variant="outline" disabled={!!busy} onClick={() => void run("copy")} className="rounded-xl">
          {busy === "copy" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Copy className="mr-1.5 h-4 w-4" />} Copy link
        </Button>
      </div>
      <p className="mt-2 text-center text-[10.5px] text-muted-foreground">Each link works once and expires in 14 days.</p>
    </div>
  );
}
