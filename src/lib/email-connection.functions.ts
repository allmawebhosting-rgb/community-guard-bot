import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasPlaceholders } from "@/lib/email-placeholders";
import {
  getEmailConnection,
  isGoogleEmailConfigured,
  sendGmail,
  validateOutgoingEmail,
  type SendGmailResult,
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

function parseOutgoing(input: { to: string; subject: string; body: string }) {
  return {
    to: String(input?.to ?? ""),
    subject: String(input?.subject ?? ""),
    body: String(input?.body ?? ""),
  };
}

/**
 * Sends the draft the user just approved by tapping Send on the email card.
 * The only path that sends from a user's Gmail; the AI cannot call it.
 */
export const sendEmailFromMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseOutgoing)
  .handler(async ({ data, context }): Promise<SendGmailResult> => {
    const checked = validateOutgoingEmail(data);
    if (!checked.ok) return { success: false, error: checked.error };
    if (hasPlaceholders(checked.value.subject, checked.value.body)) {
      return { success: false, error: "placeholders_remaining" };
    }
    return sendGmail(context.userId, checked.value);
  });
