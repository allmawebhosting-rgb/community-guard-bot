import { supabase } from "@/integrations/supabase/client";

export const GMAIL_ERROR_MESSAGES: Record<string, string> = {
  cancelled: "Gmail connection was cancelled.",
  access_denied: "Gmail connection was cancelled.",
  send_permission_not_granted: 'Gmail permission not granted. Tick "Send email on your behalf" when Google asks.',
  invalid_state: "That connection link expired. Please tap Connect Gmail again.",
  no_refresh_token: "Google did not return a long-lived permission. Please try again.",
  save_failed: "Could not save the connection. Please try again.",
};

export async function gmailAuthedFetch(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

/** Asks the server for the Google consent URL and navigates to it. Returns an error message on failure. */
export async function beginGmailConnect(): Promise<string | null> {
  try {
    const res = await gmailAuthedFetch("/api/email/google/start");
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !json.url) {
      return json.error === "google_not_configured"
        ? "Gmail sign-in is not set up on this deployment yet."
        : "Could not start the Gmail connection. Please sign in again.";
    }
    window.location.href = json.url;
    return null;
  } catch {
    return "Could not start the Gmail connection.";
  }
}

export function sendErrorMessage(error?: string) {
  switch (error) {
    case "gmail_not_connected":
      return "Connect your Gmail first, then tap Send.";
    case "reconnect_needed":
      return "Your Gmail connection expired. Please reconnect it.";
    case "google_not_configured":
      return "Gmail sign-in is not set up on this deployment yet.";
    case "daily_limit":
      return "You have reached today's limit of 20 emails. Try again tomorrow.";
    case "invalid_recipient":
      return "Enter one valid recipient email address.";
    case "empty_subject":
      return "Add a subject before sending.";
    case "empty_body":
      return "Write a message before sending.";
    case "gmail_403":
      return "Google refused to send. Reconnect Gmail and allow sending.";
    default:
      return "The email could not be sent. Please try again.";
  }
}
