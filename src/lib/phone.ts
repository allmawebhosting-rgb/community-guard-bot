/**
 * Uganda-first phone normalization, mirrored by the SQL function
 * public.normalize_phone_ug so client and database agree on identity.
 */
export const UG_DIAL_CODE = "+256";

export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("00256")) return `+${digits.slice(2)}`;
  if (digits.startsWith("256") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+256${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("7")) return `+256${digits}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  return `+${digits}`;
}

export function isLikelyValidPhone(raw: string): boolean {
  const normalized = normalizePhone(raw);
  if (!normalized) return false;
  const digits = normalized.slice(1);
  if (normalized.startsWith("+256")) return digits.length === 12 && digits[3] === "7";
  return digits.length >= 8 && digits.length <= 15;
}

/** Groups the local part for readability: +256 774 620 951 */
export function formatPhoneDisplay(raw: string): string {
  const normalized = normalizePhone(raw);
  if (!normalized) return raw;
  if (normalized.startsWith("+256")) {
    const local = normalized.slice(4);
    const parts = [local.slice(0, 3), local.slice(3, 6), local.slice(6, 9)].filter(Boolean);
    return `${UG_DIAL_CODE} ${parts.join(" ")}`.trim();
  }
  return normalized;
}

/** Live formatting for the national-format input (e.g. "774 620 951"). */
export function formatLocalInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^256/, "").replace(/^0/, "").slice(0, 9);
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter(Boolean).join(" ");
}
