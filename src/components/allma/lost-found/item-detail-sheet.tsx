import { useState } from "react";
import { CalendarDays, Hash, MapPin, Share2, X } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ClaimForm } from "@/components/allma/lost-found/claim-form";
import { CATEGORY_ICON } from "@/components/allma/lost-found/item-icon";
import {
  categoryOf,
  coarseArea,
  maskIdentifier,
  publicStatusLabel,
  type PublicLostFoundItem,
} from "@/lib/lost-found";

export function ItemDetailSheet({
  item,
  onOpenChange,
}: {
  item: PublicLostFoundItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [claiming, setClaiming] = useState(false);
  const Icon = item ? CATEGORY_ICON[categoryOf(item)] : CATEGORY_ICON.other;

  return (
    <Sheet
      open={!!item}
      onOpenChange={(open) => {
        if (!open) setClaiming(false);
        onOpenChange(open);
      }}
    >
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto rounded-t-[2rem] border-border/60 p-0"
      >
        {item && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="mx-auto w-full max-w-2xl px-5 pb-8 pt-5"
          >
            <SheetHeader className="p-0 text-left">
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gold/12">
                  <Icon className="h-6 w-6 text-gold" />
                </span>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="font-display text-lg font-black tracking-[-0.02em]">
                    {item.item_type}
                  </SheetTitle>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {publicStatusLabel(item.status)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close"
                  onClick={() => onOpenChange(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </SheetHeader>

            {item.photo_url && (
              <img
                src={item.photo_url}
                alt={item.item_type}
                loading="lazy"
                className="mt-4 max-h-64 w-full rounded-2xl border border-border/50 object-cover"
              />
            )}

            {item.description && (
              <p className="mt-4 text-[14px] leading-relaxed text-foreground/85">
                {item.description}
              </p>
            )}

            <dl className="mt-4 grid gap-2 sm:grid-cols-3">
              <Meta icon={MapPin} label="Area" value={coarseArea(item)} />
              <Meta
                icon={CalendarDays}
                label="Handed in"
                value={new Date(item.created_at).toLocaleDateString()}
              />
              <Meta
                icon={Hash}
                label="Reference"
                value={maskIdentifier(item.identifier) ?? "Not recorded"}
              />
            </dl>

            <div className="mt-5 space-y-3">
              {claiming ? (
                <ClaimForm itemId={item.id} />
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    className="h-12 flex-1 rounded-full text-[15px] font-semibold transition-transform active:scale-[0.98]"
                    onClick={() => setClaiming(true)}
                    disabled={item.status === "released"}
                  >
                    {item.status === "released" ? "Already released" : "This is mine — claim it"}
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-12 rounded-full px-5"
                    onClick={async () => {
                      const url = `${window.location.origin}/lost-found`;
                      const text = `Found item on Allma Safety AI: ${item.item_type} — ${coarseArea(item)}`;
                      try {
                        if (navigator.share) await navigator.share({ title: "Lost & Found", text, url });
                        else {
                          await navigator.clipboard.writeText(`${text} ${url}`);
                          toast.success("Link copied");
                        }
                      } catch {
                        /* user cancelled */
                      }
                    }}
                  >
                    <Share2 className="mr-2 h-4 w-4" /> Share
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Meta({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-secondary/35 p-3">
      <dt className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </dt>
      <dd className="mt-1 truncate text-[13px] font-medium">{value}</dd>
    </div>
  );
}
