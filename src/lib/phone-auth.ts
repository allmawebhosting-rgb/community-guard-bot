import { normalizePhone } from "@/lib/phone";

/**
 * Phone accounts sign in with a private, derived login address so users only
 * ever type their phone number. The address never receives mail.
 */
export function phoneLoginEmail(raw: string): string | null {
  const e164 = normalizePhone(raw);
  if (!e164) return null;
  return `p${e164.slice(1)}@phone.allmasafetyai.online`;
}
