import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { GMAIL_ERROR_MESSAGES, beginGmailConnect, gmailAuthedFetch } from "@/lib/gmail-client";
import { getEmailConnectionStatus } from "@/lib/email-connection.functions";

export function ConnectEmailCard() {
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getEmailConnectionStatus);
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: ["email-connection"], queryFn: () => fetchStatus() });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("gmail");
    if (!result) return;
    if (result === "connected") {
      toast.success("Gmail connected. Allma can now send emails you approve from your address.");
    } else {
      const reason = params.get("reason") ?? "";
      toast.error(GMAIL_ERROR_MESSAGES[reason] ?? "Could not connect Gmail. Please try again.");
    }
    params.delete("gmail");
    params.delete("reason");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    void queryClient.invalidateQueries({ queryKey: ["email-connection"] });
  }, [queryClient]);

  async function connect() {
    setBusy(true);
    const error = await beginGmailConnect();
    if (error) {
      toast.error(error);
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await gmailAuthedFetch("/api/email/google/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("disconnect_failed");
      await queryClient.invalidateQueries({ queryKey: ["email-connection"] });
      toast.success("Gmail disconnected.");
    } catch {
      toast.error("Could not disconnect Gmail. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const data = status.data;
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Mail className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold">Gmail</p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
            {data?.connected
              ? `Gmail connected: ${data.email}. Allma sends only the emails you approve, from this address.`
              : "Sign in with Google once. Allma never sees your password and only gets permission to send, not to read your mail."}
          </p>
        </div>
      </div>
      <div className="mt-3">
        {status.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : data?.connected ? (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[12px] font-semibold disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Disconnect
          </button>
        ) : data && !data.configured ? (
          <p className="text-[11.5px] text-muted-foreground">
            Gmail sign-in is not set up on this deployment yet. The site owner needs to add Google OAuth keys.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Connect Gmail
          </button>
        )}
      </div>
    </div>
  );
}
