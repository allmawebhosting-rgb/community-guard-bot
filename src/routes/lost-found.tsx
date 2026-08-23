import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { PackageSearch, PlusCircle, Search, ShieldCheck, X } from "lucide-react";
import { AppShell } from "@/components/allma/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LostFoundGrid } from "@/components/allma/lost-found/lost-found-grid";
import { ItemDetailSheet } from "@/components/allma/lost-found/item-detail-sheet";
import { ReportLostForm } from "@/components/allma/lost-found/report-lost-form";
import { CATEGORY_ICON } from "@/components/allma/lost-found/item-icon";
import {
  LF_CATEGORIES,
  categoryOf,
  publicLostFoundQuery,
  type LfCategoryId,
  type PublicLostFoundItem,
} from "@/lib/lost-found";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lost-found")({
  head: () => ({
    meta: [
      { title: "Lost & Found — Allma Safety AI" },
      {
        name: "description",
        content:
          "Search property handed in to police in Uganda, claim your item with proof, or post something you lost so officers can match it.",
      },
      { property: "og:title", content: "Lost & Found — Allma Safety AI" },
      {
        property: "og:description",
        content:
          "Search safely for property handed in to police, claim your item, or post a lost-item report.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LostFoundPage,
});

const CATEGORY_OPTIONS: { id: LfCategoryId; label: string }[] = [
  ...LF_CATEGORIES.map((c) => ({ id: c.id as LfCategoryId, label: c.label })),
  { id: "other", label: "Other" },
];

function LostFoundPage() {
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState("");
  const [category, setCategory] = useState<LfCategoryId | "">("");
  const [selected, setSelected] = useState<PublicLostFoundItem | null>(null);
  const [reporting, setReporting] = useState(false);

  const { data: items = [], isLoading } = useQuery(publicLostFoundQuery);

  const districts = useMemo(
    () => [...new Set(items.map((item) => item.district).filter(Boolean))] as string[],
    [items],
  );

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const haystack = `${item.item_type} ${item.description ?? ""}`.toLowerCase();
        return (
          (!search || haystack.includes(search.toLowerCase())) &&
          (!district || item.district === district) &&
          (!category || categoryOf(item) === category)
        );
      }),
    [items, search, district, category],
  );

  const available = items.filter(
    (item) => item.status !== "released" && item.status !== "claimed",
  ).length;

  return (
    <AppShell title="Lost & Found">
      <main className="mx-auto w-full max-w-6xl px-5 pb-14 pt-6 lg:px-10 lg:pt-8">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="premium-surface relative overflow-hidden rounded-[2rem] border border-border/60 p-6 shadow-soft sm:p-9"
        >
          <span className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-gold/12 blur-3xl" />
          <span className="pointer-events-none absolute -left-24 bottom--20 h-64 w-64 rounded-full bg-primary/12 blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/[0.07] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
                <ShieldCheck className="h-3 w-3" /> Police property desk
              </p>
              <h1 className="mt-3 font-display text-4xl font-black tracking-[-0.05em] sm:text-5xl">
                Lost &amp; Found
              </h1>
              <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground">
                Search property handed in to police, claim what is yours with proof of ownership, or
                post something you lost so officers can match it for you.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <Button
                  onClick={() => setReporting(true)}
                  className="h-11 rounded-full px-5 text-[14px] font-semibold transition-transform active:scale-[0.98]"
                >
                  <PlusCircle className="mr-2 h-4 w-4" /> Post a lost item
                </Button>
                <Button
                  variant="secondary"
                  className="h-11 rounded-full px-5 text-[14px]"
                  onClick={() =>
                    document
                      .getElementById("handed-in")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                >
                  Browse handed-in items
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat value={available} label="Available to claim" tone="gold" />
              <Stat value={items.length} label="Items recorded" tone="muted" />
            </div>
          </div>
        </motion.header>

        {reporting && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 24 }}
            className="premium-surface mt-6 rounded-[1.8rem] border border-gold/25 p-5 shadow-soft sm:p-7"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-black tracking-[-0.03em]">
                  Post a lost item
                </h2>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  Your report goes to verified officers for matching. Your contact details stay
                  private.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close lost item form"
                onClick={() => setReporting(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ReportLostForm onDone={() => setReporting(false)} />
          </motion.section>
        )}

        <div id="handed-in" className="mt-8 scroll-mt-24">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search item type or description"
                aria-label="Search handed-in items"
                className="h-12 rounded-full bg-secondary/40 pl-10 text-[15px] focus-visible:ring-gold/40"
              />
            </div>
            <select
              value={district}
              onChange={(event) => setDistrict(event.target.value)}
              aria-label="Filter by district"
              className="h-12 rounded-full border border-border/60 bg-secondary/40 px-4 text-[14px] sm:w-52"
            >
              <option value="">All districts</option>
              {districts.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {CATEGORY_OPTIONS.map(({ id, label }) => {
              const Icon = CATEGORY_ICON[id];
              const active = category === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCategory(active ? "" : id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-[11.5px] font-bold transition-all active:scale-[0.97]",
                    active
                      ? "border-gold/45 bg-gold/12 text-gold"
                      : "border-border/55 text-muted-foreground hover:border-gold/25 hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              );
            })}
          </div>

          <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Handed-in items <span className="ml-1 text-foreground">{filtered.length}</span>
          </p>

          {isLoading ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-72 animate-pulse rounded-[1.6rem] border border-border/50 bg-card/50"
                />
              ))}
            </div>
          ) : filtered.length ? (
            <div className="mt-4">
              <LostFoundGrid items={filtered} onSelect={setSelected} />
            </div>
          ) : (
            <div className="premium-surface mt-4 rounded-[1.8rem] border border-dashed border-border/60 p-14 text-center">
              <PackageSearch className="mx-auto h-9 w-9 text-muted-foreground/40" />
              <h2 className="mt-4 font-display text-lg font-bold">No handed-in items yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-[13px] text-muted-foreground">
                Nothing matches this search right now. Post what you lost and officers will match it
                against property handed in later.
              </p>
              <Button
                onClick={() => setReporting(true)}
                className="mt-5 h-11 rounded-full px-5 text-[14px] font-semibold"
              >
                <PlusCircle className="mr-2 h-4 w-4" /> Post a lost item
              </Button>
            </div>
          )}
        </div>
      </main>

      <ItemDetailSheet item={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </AppShell>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "gold" | "muted";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-5 py-4",
        tone === "gold" ? "border-gold/25 bg-gold/[0.07]" : "border-border/55 bg-secondary/35",
      )}
    >
      <p
        className={cn(
          "font-display text-2xl font-black",
          tone === "gold" ? "text-gold" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
