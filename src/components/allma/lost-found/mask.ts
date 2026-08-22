export function maskIdentifier(value: string | null | undefined) {
  if (!value) return null;
  const clean = value.trim();
  if (clean.length <= 3) return "••••";
  return `••••${clean.slice(-3)}`;
}

export function safeArea(value: string | null | undefined, district: string | null | undefined) {
  return district?.trim() || value?.split(",")[0]?.trim() || "Area withheld";
}
