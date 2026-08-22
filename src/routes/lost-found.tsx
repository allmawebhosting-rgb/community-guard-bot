import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, PackageSearch, Search, X } from "lucide-react";
import { AppShell } from "@/components/allma/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { LostFoundGrid, type FoundItem } from "@/components/allma/lost-found/lost-found-grid";
import { ItemDetailSheet } from "@/components/allma/lost-found/item-detail-sheet";
import { ReportLostForm } from "@/components/allma/lost-found/report-lost-form";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lost-found")({
  head: () => ({ meta: [
    { title: "Lost & Found — Allma Safety AI" },
    { name: "description", content: "Search items handed in to police or report something you lost in Uganda." },
    { property: "og:title", content: "Lost & Found — Allma Safety AI" },
    { property: "og:description", content: "Search safely for property handed in to police and post a lost-item report." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: LostFoundPage,
});

const CATEGORIES = ["Phone", "Bag", "Documents", "Wallet", "Keys", "Other"];
function LostFoundPage() {
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<FoundItem | null>(null);
  const [reporting, setReporting] = useState(false);
  const { data: items = [], isLoading } = useQuery({ queryKey: ["lost-found", "found"], queryFn: async () => { const { data, error } = await supabase.from("lost_found_items").select("id,item_type,description,district,location_text,identifier,photo_url,status,created_at").eq("kind", "found").order("created_at", { ascending: false }); if (error) throw error; return (data ?? []) as FoundItem[]; } });
  const districts = useMemo(() => [...new Set(items.map((item) => item.district).filter(Boolean))] as string[], [items]);
  const filtered = items.filter((item) => { const haystack = `${item.item_type} ${item.description ?? ""}`.toLowerCase(); return (!search || haystack.includes(search.toLowerCase())) && (!district || item.district === district) && (!category || item.item_type.toLowerCase().includes(category.toLowerCase())); });
  return <AppShell title="Lost & Found"><main className="mx-auto w-full max-w-6xl px-5 pb-10 pt-6 lg:px-10 lg:pt-8"><header className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card/70 p-6 shadow-soft sm:p-9"><div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" /><div className="relative flex flex-wrap items-end justify-between gap-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Police property desk</p><h1 className="mt-2 font-display text-4xl font-black tracking-[-0.05em]">Lost & Found</h1><p className="mt-3 max-w-xl text-[13px] leading-relaxed text-muted-foreground">Search property safely handed in to police, or tell us what you lost so officers can match it.</p></div><div className="rounded-2xl border border-gold/25 bg-gold/[0.07] px-5 py-4"><p className="text-2xl font-black text-gold">{items.length}</p><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Available to claim</p></div></div></header><div className="mt-6 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item type or description" className="h-11 rounded-xl pl-9" /></div><select value={district} onChange={(event) => setDistrict(event.target.value)} aria-label="Filter by district" className="h-11 rounded-xl border border-input bg-background px-3 text-sm sm:w-48"><option value="">All districts</option>{districts.map((value) => <option key={value} value={value}>{value}</option>)}</select></div><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{CATEGORIES.map((value) => <button key={value} type="button" onClick={() => setCategory(category === value ? "" : value)} className={cn("whitespace-nowrap rounded-full border px-3.5 py-2 text-[11px] font-bold transition", category === value ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-accent")}>{value}</button>)}</div><div className="mt-8 flex items-center justify-between gap-3"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Handed-in items <span className="ml-1 text-foreground">{filtered.length}</span></p><Button type="button" variant="outline" onClick={() => setReporting((value) => !value)} className="rounded-xl"><FileText className="mr-2 h-4 w-4" /> I lost something</Button></div>{reporting && <section className="mt-4 rounded-2xl border border-primary/20 bg-primary/[0.04] p-5 sm:p-7"><div className="mb-5 flex items-start justify-between"><div><h2 className="font-display text-xl font-black">Post a lost item</h2><p className="mt-1 text-[12px] text-muted-foreground">Your report goes to police for matching. Contact details stay private.</p></div><button type="button" onClick={() => setReporting(false)} aria-label="Close lost item form"><X className="h-5 w-5 text-muted-foreground" /></button></div><ReportLostForm onDone={() => setReporting(false)} /></section>}{isLoading ? <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-80 animate-pulse rounded-2xl border border-border/50 bg-card/50" />)}</div> : filtered.length ? <div className="mt-5"><LostFoundGrid items={filtered} onSelect={setSelected} /></div> : <div className="mt-5 rounded-2xl border border-dashed border-border/70 bg-card/40 p-14 text-center"><PackageSearch className="mx-auto h-9 w-9 text-muted-foreground/40" /><h2 className="mt-4 font-display text-lg font-bold">No handed-in items found</h2><p className="mt-2 text-[13px] text-muted-foreground">Try another search or post what you lost for police to match.</p></div>}</main><ItemDetailSheet item={selected} onClose={() => setSelected(null)} /></AppShell>;
}
