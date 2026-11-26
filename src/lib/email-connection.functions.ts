import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildGoogleAuthUrl,
  disconnectEmail,
  getEmailConnection,
  isGoogleEmailConfigured,
  sendViaConnectedGmail,
} from "@/lib/gmail-connection.server";

export type EmailConnectionStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
};

export const getEmailConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailConnectionStatus> => {
    const connection = await getEmailConnection(context.userId);
    return {
      configured: isGoogleEmailConfigured(),
      connected: Boolean(connection),
      email: connection?.email ?? null,
    };
  });

function validateOrigin(input: { origin: string }) {
  const origin = new URL(input.origin).origin;
  if (!/^https?:$/.test(new URL(origin).protocol)) throw new Error("Invalid origin.");
  return { origin };
}

export const startGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateOrigin)
  .handler(async ({ data, context }) => {
    if (!isGoogleEmailConfigured()) {
      return { ok: false as const, error: "google_not_configured" };
    }
    return {
      ok: true as const,
      url: await buildGoogleAuthUrl({ userId: context.userId, origin: data.origin }),
    };
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await disconnectEmail(context.userId);
    return { ok: true as const };
  });

function validateEmail(input: { to: string; subject: string; body: string }) {
  const to = String(input.to ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 200) throw new Error("A valid recipient is required.");
  const subject = String(input.subject ?? "").trim().slice(0, 200);
  const body = String(input.body ?? "").trim().slice(0, 8000);
  if (!subject || !body) throw new Error("Subject and message are required.");
  return { to, subject, body };
}

/** Send a message from the signed-in user's own connected Gmail. */
export const sendEmailFromMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateEmail)
  .handler(async ({ data, context }) =>
    sendViaConnectedGmail({ userId: context.userId, to: data.to, subject: data.subject, text: data.body }),
  );
