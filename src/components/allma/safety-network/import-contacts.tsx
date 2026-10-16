import { useEffect, useRef, useState } from "react";
import { BadgeCheck, BookUser, FileUp, Loader2, Send, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isLikelyValidPhone, normalizePhone } from "@/lib/phone";
import { type MemberMatch, inviteMessage, searchMemberByPhone, sendConnectionRequest } from "@/lib/safety-network";
import { Avatar } from "./add-safety-contact";
import { ContactSetupSheet, savePendingSetup, type ContactSetup } from "./contact-setup-sheet";

type Imported = { name: string; phone: string };
type Row = Imported & {
  status: "checking" | "member" | "not_member" | "invalid" | "sent" | "sending" | "invited";
  match?: MemberMatch | null;
};

type ContactsApi = {
  select: (props: string[], opts: { multiple: boolean }) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
};

/** Parses .vcf files exported from a phone's Contacts app. */
export function parseVcf(text: string): Imported[] {
  const out: Imported[] = [];
  for (const card of text.split(/BEGIN:VCARD/i).slice(1)) {
    const name = card.match(/^FN[^:]*:(.+)$/im)?.[1]?.trim() ?? "";
    const tel = card.match(/^TEL[^:]*:(.+)$/im)?.[1]?.trim() ?? "";
    if (tel) out.push({ name: name || tel, phone: tel });
  }
  return out;
}

export function ImportContacts({ onRequestSent }: { onRequestSent?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [supported, setSupported] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [setupRow, setSetupRow] = useState<Row | null>(null);

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && "contacts" in navigator);
  }, []);

  async function load(list: Imported[]) {
    const seen = new Set<string>();
    const unique = list
      .map((c) => ({ ...c, phone: normalizePhone(c.phone) ?? c.phone }))
      .filter((c) => (seen.has(c.phone) ? false : (seen.add(c.phone), true)))
      .slice(0, 25);
    if (!unique.length) {
      toast.error("No phone numbers found in those contacts");
      return;
    }
    const initial: Row[] = unique.map((c) => ({
      ...c,
      status: isLikelyValidPhone(c.phone) ? "checking" : "invalid",
    }));
    setRows(initial);
    for (const row of initial) {
      if (row.status === "invalid") continue;
      try {
        const match = await searchMemberByPhone(row.phone);
        setRows((prev) =>
          prev.map((r) =>
            r.phone === row.phone ? { ...r, match, status: match ? "member" : "not_member" } : r,
          ),
        );
      } catch {
        setRows((prev) => prev.map((r) => (r.phone === row.phone ? { ...r, status: "not_member" } : r)));
      }
    }
  }

  async function pick() {
    try {
      const api = (navigator as unknown as { contacts: ContactsApi }).contacts;
      const picked = await api.select(["name", "tel"], { multiple: true });
      await load(
        picked.flatMap((c) => (c.tel ?? []).slice(0, 1).map((tel) => ({ name: c.name?.[0] ?? tel, phone: tel }))),
      );
    } catch {
      /* user closed the picker */
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await load(parseVcf(await file.text()));
  }

  async function confirmSetup(setup: ContactSetup) {
    const row = setupRow;
    if (!row) return;
    setSetupRow(null);
    if (row.match) {
      savePendingSetup(row.match.user_id, setup);
      await request(row);
    } else {
      invite(row);
    }
  }

  async function request(row: Row) {
    if (!row.match) return;
    setRows((p) => p.map((r) => (r.phone === row.phone ? { ...r, status: "sending" } : r)));
    try {
      await sendConnectionRequest(row.match.user_id);
      setRows((p) => p.map((r) => (r.phone === row.phone ? { ...r, status: "sent" } : r)));
      onRequestSent?.();
    } catch (error) {
      setRows((p) => p.map((r) => (r.phone === row.phone ? { ...r, status: "member" } : r)));
      toast.error(error instanceof Error ? error.message : "Could not send request");
    }
  }

  function invite(row: Row) {
    const text = `Hi ${row.name}, I've added you as my emergency contact on ALLMA Safety AI. Please join so you can get my alerts if I ever need help: ${window.location.origin}/auth`;
    const digits = row.phone.replace(/\D/g, "");
    if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
      window.location.href = `sms:${row.phone}${/iPhone|iPad/i.test(navigator.userAgent) ? "&" : "?"}body=${encodeURIComponent(text)}`;
    } else {
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    }
    setRows((p) => p.map((r) => (r.phone === row.phone ? { ...r, status: "invited" } : r)));
    void inviteMessage;
  }

  const [qr, setQr] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const desktop = !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    setIsDesktop(desktop);
    if (!desktop) return;
    void import("qrcode").then((QR) =>
      QR.toDataURL(`${window.location.origin}/safety-network?from=qr`, { width: 220, margin: 1 }).then(setQr),
    );
  }, []);

  return (
    <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
      <p className="text-[13px] font-bold">Add people from your phone contacts</p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
        Pick the people Allma should reach in an emergency. We only check who already uses Allma — your contact list is never uploaded.
      </p>
      {supported && (
        <Button type="button" onClick={() => void pick()} className="mt-3 h-12 w-full rounded-xl text-[14px] font-bold">
          <BookUser className="mr-2 h-5 w-5" /> Choose from my contacts
        </Button>
      )}
      {!supported && isDesktop && (
        <div className="mt-3 flex flex-col items-center gap-3 rounded-xl border border-border/50 bg-background/70 p-4 sm:flex-row">
          {qr ? <img src={qr} alt="QR code to open Allma on your phone" className="size-40 rounded-lg bg-card p-1" /> : <div className="size-40 animate-pulse rounded-lg bg-muted" />}
          <div className="text-[12px] leading-relaxed">
            <p className="text-[13px] font-bold">Use your phone's contacts</p>
            <ol className="mt-1 list-decimal pl-4 text-muted-foreground">
              <li>Point your phone camera at this code.</li>
              <li>Sign in with the same account.</li>
              <li>Tap “Choose from my contacts”.</li>
            </ol>
            <p className="mt-1 text-muted-foreground">People you add appear here once they accept.</p>
          </div>
        </div>
      )}
      {!supported && !isDesktop && (
        <p className="mt-3 rounded-xl bg-muted/60 p-3 text-[11.5px] text-muted-foreground">
          This browser can’t open your contacts list. Open Allma in Chrome on Android to pick contacts, or search a number above.
        </p>
      )}
      <button type="button" onClick={() => fileRef.current?.click()} className="mt-2 text-[11px] text-muted-foreground underline">
        <FileUp className="mr-1 inline h-3 w-3" />I have a contacts file
      </button>
      <input ref={fileRef} type="file" accept=".vcf,text/vcard,text/x-vcard" hidden onChange={(e) => void onFile(e)} />
      {rows.length > 0 && (
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li key={row.phone} className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/60 p-2.5">
              <Avatar name={row.match?.full_name ?? row.name} url={row.match?.avatar_url} size={38} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{row.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {row.status === "checking" && "Checking…"}
                  {row.status === "invalid" && "Number not recognised"}
                  {row.status === "not_member" && "Not on Allma yet"}
                  {(row.status === "member" || row.status === "sending") && (
                    <span className="inline-flex items-center gap-1 text-trusted">
                      <BadgeCheck className="h-3 w-3" /> On Allma
                      {row.match?.relationship_state === "connected" && " · already connected"}
                      {row.match?.relationship_state === "request_sent" && " · request pending"}
                    </span>
                  )}
                  {row.status === "invited" && <span className="text-success">Invite opened — send it to finish</span>}
                  {row.status === "sent" && <span className="text-success">Request sent — awaiting acceptance</span>}
                </p>
              </div>
              {row.status === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {(row.status === "member" || row.status === "sending") &&
                row.match?.relationship_state === "none" && (
                  <Button size="sm" disabled={row.status === "sending"} onClick={() => setSetupRow(row)} className="rounded-lg">
                    {row.status === "sending" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                    Add
                  </Button>
                )}
              {row.status === "not_member" && (
                <Button size="sm" variant="outline" onClick={() => setSetupRow(row)} className="rounded-lg">
                  <Share2 className="mr-1 h-3.5 w-3.5" /> Invite
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ContactSetupSheet
        contact={setupRow ? { name: setupRow.match?.full_name ?? setupRow.name, phone: setupRow.phone, avatar: setupRow.match?.avatar_url, onAllma: !!setupRow.match } : null}
        onCancel={() => setSetupRow(null)}
        onConfirm={(s) => void confirmSetup(s)}
      />
    </div>
  );
}
