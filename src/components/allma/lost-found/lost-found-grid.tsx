import { motion } from "motion/react";
import { CalendarDays, MapPin } from "lucide-react";
import { CATEGORY_ICON } from "@/components/allma/lost-found/item-icon";
import {
  categoryOf,
  coarseArea,
  maskIdentifier,
  publicStatusLabel,
  type PublicLostFoundItem,
} from "@/lib/lost-found";
import { cn } from "@/lib/utils";

function statusTone(status: string) {
  if (status === "released") return "border-border/50 bg-secondary/50 text-muted-foreground";
  if (status === "claimed" || status === "under_review" || status === "matched")
    return "border-gold/30 bg-gold/10 text-gold";
  return "border-primary/30 bg-primary/10 text-primary";
}

export function LostFoundGrid({
  items,
  onSelect,
}: {
  items: PublicLostFoundItem[];
  onSelect: (item: PublicLostFoundItem) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => {
        const Icon = CATEGORY_ICON[categoryOf(item)];
        const reference = maskIdentifier(item.identifier);
        return (
          <motion.button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.035, 0.3), duration: 0.28 }}
            className="premium-surface group relative overflow-hidden rounded-[1.6rem] border border-border/55 text-left shadow-soft transition-all hover:-translate-y-1 hover:border-gold/40 hover:shadow-lg"
          >
            <span className="pointer-events-none absolute inset-x-0 -top-24 h-40 bg-gradient-to-b from-gold/12 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative flex h-40 items-center justify-center overflow-hidden bg-secondary/35">
              {item.photo_url ? (
                <img
                  src={item.photo_url}
                  alt={item.item_type}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              ) : (
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gold/12 text-gold">
                  <Icon className="h-7 w-7" />
                </span>
              )}
              <span
                className={cn(
                  "absolute left-3 top-3 rounded-full border px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.14em] backdrop-blur",
                  statusTone(item.status),
                )}
              >
                {publicStatusLabel(item.status)}
              </span>
            </div>

            <div className="relative p-4">
              <p className="font-display text-[15px] font-bold capitalize tracking-[-0.02em]">
                {item.item_type}
              </p>
              <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
                {item.description || "Description withheld for safe matching."}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {coarseArea(item)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  {new Date(item.created_at).toLocaleDateString("en-UG", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              {reference && (
                <p className="mt-2 font-mono text-[11px] text-muted-foreground/80">
                  Ref {reference}
                </p>
              )}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
