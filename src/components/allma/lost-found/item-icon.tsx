import { Backpack, CreditCard, FileText, KeyRound, Package, Smartphone, Wallet } from "lucide-react";
import type { LfCategoryId } from "@/lib/lost-found";

export const CATEGORY_ICON: Record<LfCategoryId, typeof Package> = {
  phone: Smartphone,
  bag: Backpack,
  documents: FileText,
  wallet: Wallet,
  keys: KeyRound,
  other: Package,
};

export const CATEGORY_FALLBACK = CreditCard;
