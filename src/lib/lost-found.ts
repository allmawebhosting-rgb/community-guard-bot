import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PublicLostFoundItem =
  Database["public"]["Tables"]["lost_found_items"]["Row"];

/** Categories used by the public filter chips. */
export const LF_CATEGORIES = [
  { id: "phone", label: "Phone", match: ["phone", "mobile", "smartphone", "itel", "tecno"] },
  { id: "bag", label: "Bag", match: ["bag", "backpack", "satchel", "suitcase", "luggage"] },
  { id: "documents", label: "Documents", match: ["document", "id", "passport", "certificate", "card", "licence", "license"] },
  { id: "wallet", label: "Wallet", match: ["wallet", "purse", "money"] },
  { id: "keys", label: "Keys", match: ["key", "keys"] },
] as const;

export type LfCategoryId = (typeof LF_CATEGORIES)[number]["id"] | "other";

export function categoryOf(item: PublicLostFoundItem): LfCategoryId {
  const haystack = `${item.item_type} ${item.description ?? ""}`.toLowerCase();
  for (const c of LF_CATEGORIES) {
    if (c.match.some((m) => haystack.includes(m))) return c.id;
  }
  return "other";
}

/**
 * Masks identifiers so an owner can still recognise their item without
 * giving a stranger enough detail to fake a claim.
 */
export function maskIdentifier(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length <= 3) return "•".repeat(trimmed.length);
  return `${"•".repeat(Math.min(6, trimmed.length - 3))}${trimmed.slice(-3)}`;
}

/** Reduces a free-text hand-in location to a coarse area. */
export function coarseArea(item: PublicLostFoundItem): string {
  if (item.district) return item.district;
  const text = item.location_text?.trim();
  if (!text) return "Area not recorded";
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "Area not recorded";
}

export const PUBLIC_STATUS_LABEL: Record<string, string> = {
  found: "Available to claim",
  logged: "Available to claim",
  open: "Available to claim",
  claimed: "Claim under review",
  under_review: "Claim under review",
  matched: "Match under review",
  released: "Released to owner",
};

export function publicStatusLabel(status: string): string {
  return PUBLIC_STATUS_LABEL[status] ?? "Available to claim";
}

export const publicLostFoundQuery = queryOptions({
  queryKey: ["public", "lost-found"],
  queryFn: async (): Promise<PublicLostFoundItem[]> => {
    const { data, error } = await supabase
      .from("lost_found_items")
      .select("*")
      .eq("kind", "found")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  },
});

export async function submitClaim(input: {
  itemId: string;
  name: string;
  phone: string;
  proof: string;
}) {
  const { error } = await supabase.from("lost_found_claims").insert({
    item_id: input.itemId,
    claimant_name: input.name.trim(),
    claimant_phone: input.phone.trim(),
    proof_text: input.proof.trim(),
  });
  if (error) throw error;
}

export async function submitPublicLostReport(input: {
  itemType: string;
  description?: string;
  locationText?: string;
  district?: string;
  occurredOn?: string;
  contactName: string;
  contactPhone: string;
}) {
  const { error } = await supabase.from("lost_found_public_reports").insert({
    item_type: input.itemType.trim(),
    description: input.description?.trim() || null,
    location_text: input.locationText?.trim() || null,
    district: input.district?.trim() || null,
    occurred_on: input.occurredOn || null,
    contact_name: input.contactName.trim(),
    contact_phone: input.contactPhone.trim(),
  });
  if (error) throw error;
}

export function timeAgoShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
