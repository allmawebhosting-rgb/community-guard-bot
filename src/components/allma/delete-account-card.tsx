import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function DeleteAccountCard() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError("Please sign in again first.");
        return;
      }
      const res = await fetch("/api/account-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(pin ? { password: pin } : {}),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Account deletion could not be completed.");
        return;
      }
      await supabase.auth.signOut();
      navigate({ to: "/", replace: true });
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-border/50 px-5 py-4">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-4 text-left text-destructive"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-destructive/10">
            <Trash2 className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <span className="block text-[13.5px] font-semibold">Delete my account</span>
            <span className="block text-[11.5px] text-destructive/70">
              Permanently removes your account and personal data
            </span>
          </div>
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] font-semibold text-destructive">Delete your account permanently?</p>
          <p className="text-[12px] text-muted-foreground">
            Your login, profile, contacts and devices are removed. Shared call history and public reports stay
            but show "Former Member". This cannot be undone.
          </p>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Your PIN or password (Google users: leave empty)"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px]"
          />
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder='Type DELETE to confirm'
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px]"
          />
          {error && <p className="text-[12px] text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setOpen(false); setError(null); }}
              className="flex-1 rounded-xl border border-border px-3 py-2 text-[13px] font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || confirmText !== "DELETE"}
              onClick={handleDelete}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-destructive px-3 py-2 text-[13px] font-semibold text-destructive-foreground disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete forever
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
