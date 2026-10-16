import { useEffect, useState } from "react";
import { Bell, Loader2, Phone, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SAFETY_ROLES } from "@/lib/safety-network";
import { Avatar } from "./add-safety-contact";

export type ContactSetup = { role: string; priority: 1 | 2 | 3 };

const PRIORITIES = [
  { value: 1, title: "Primary", hint: "Called first when you press SOS.", icon: Phone },
  { value: 2, title: "Backup", hint: "Called next if your primary people don't answer.", icon: Phone },
  { value: 3, title: "Additional", hint: "Gets an alert and updates about your emergency.", icon: Bell },
] as const;

const PREFS_KEY = "allma-pending-contact-setup";

/** Saves the relationship and priority chosen before a request is accepted. */
export function savePendingSetup(memberId: string, setup: ContactSetup) {
  const all = readPendingSetups();
  all[memberId] = setup;
  localStorage.setItem(PREFS_KEY, JSON.stringify(all));
}

export function readPendingSetups(): Record<string, ContactSetup> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function clearPendingSetup(memberId: string) {
  const all = readPendingSetups();
  delete all[memberId];
  localStorage.setItem(PREFS_KEY, JSON.stringify(all));
}

export function ContactSetupSheet({
  contact,
  busy,
  onCancel,
  onConfirm,
}: {
  contact: { name: string; phone: string; avatar?: string | null; onAllma: boolean } | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (setup: ContactSetup) => void;
}) {
  const [role, setRole] = useState<string>("Family");
  const [priority, setPriority] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    if (contact) {
      setRole("Family");
      setPriority(1);
    }
  }, [contact]);

  return (
    <Dialog open={!!contact} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-md gap-0 overflow-y-auto rounded-3xl p-0">
        {contact && (
          <>
            <DialogHeader className="space-y-3 border-b border-border/50 px-5 pb-5 pt-6 text-left">
              <div className="flex items-center gap-3">
                <Avatar name={contact.name} url={contact.avatar ?? null} size={52} />
                <div className="min-w-0">
                  <DialogTitle className="font-display text-lg font-bold leading-tight">{contact.name}</DialogTitle>
                  <p className="text-[12px] text-muted-foreground">{contact.phone}</p>
                </div>
              </div>
              <DialogDescription className="text-[12.5px] leading-relaxed">
                Tell Allma who this person is and when to reach them in an emergency.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 px-5 py-5">
              <section>
                <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  1 · Relationship
                </p>
                <div className="flex flex-wrap gap-2">
                  {SAFETY_ROLES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setRole(item)}
                      aria-pressed={role === item}
                      className={cn(
                        "rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-colors",
                        role === item
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background/60 text-foreground hover:border-primary/50",
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  2 · Emergency order
                </p>
                <div className="space-y-2">
                  {PRIORITIES.map((p) => {
                    const active = priority === p.value;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setPriority(p.value)}
                        aria-pressed={active}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors",
                          active ? "border-primary bg-primary/10" : "border-border bg-background/50 hover:border-primary/40",
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-sm font-bold",
                            active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                          )}
                        >
                          {p.value}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-bold">{p.title}</span>
                          <span className="block text-[11.5px] leading-snug text-muted-foreground">{p.hint}</span>
                        </span>
                        <p.icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                      </button>
                    );
                  })}
                </div>
              </section>

              <p className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-[11.5px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                {contact.onAllma
                  ? "They must accept your request first. Your choices apply as soon as they do."
                  : "They aren't on Allma yet. We'll send an invite — your choices apply once they join and accept."}
              </p>

              <div className="flex gap-2">
                <Button variant="outline" onClick={onCancel} className="h-12 flex-1 rounded-xl">
                  Cancel
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => onConfirm({ role, priority })}
                  className="h-12 flex-[2] rounded-xl font-bold"
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {contact.onAllma ? "Send request" : "Send invite"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
