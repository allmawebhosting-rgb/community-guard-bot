import { motion } from "motion/react";
import { FileText, KeyRound, Package, Phone, Wallet } from "lucide-react";
import { maskIdentifier, safeArea } from "./mask";

export type FoundItem = { id: string; item_type: string; description: string | null; district: string | null; location_text: string | null; identifier: string | null; photo_url: string | null; status: string; created_at: string };

const ICONS: Record<string, typeof Package> = { phone: Phone, wallet: Wallet, documents: FileText, keys: KeyRound };
function iconFor(type: string) { return ICONS[type.toLowerCase()] ?? Package; }
function statusLabel(status: string) { return status === "released" ? "Released" : status === "claimed" ? "Claim under review" : "Available"; }

export function LostFoundGrid({ items, onSelect }: { items: FoundItem[]; onSelect: (item: FoundItem) => void }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((item, index) => { const Icon = iconFor(item.item_type); return <motion.button key={item.id} type="button" onClick={() => onSelect(item)} className="premium-surface overflow-hidden rounded-2xl border border-border/60 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-primary/35" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04, duration: 0.24 }}><div className="flex h-40 items-center justify-center bg-secondary/40">{item.photo_url ? <img src={item.photo_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-8 w-8" /></div>}</div><div className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[14px] font-bold capitalize">{item.item_type}</p><p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{item.description || "Description withheld for safe matching."}</p></div><span className="shrink-0 rounded-full bg-success/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-success">{statusLabel(item.status)}</span></div><p className="mt-4 text-[11px] text-muted-foreground">{safeArea(item.location_text, item.district)} · {new Date(item.created_at).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" })}</p>{item.identifier && <p className="mt-1 text-[11px] text-muted-foreground">Reference {maskIdentifier(item.identifier)}</p>}</div></motion.button>; })}</div>;
}
