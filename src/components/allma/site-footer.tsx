import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { BrandMark } from "@/components/allma/brand";
import { cn } from "@/lib/utils";

const GROUPS = [
  {
    title: "Product",
    links: [
      { label: "Allma assistant", to: "/chat" },
      { label: "Community alerts", to: "/alerts" },
      { label: "Lost & Found", to: "/lost-found" },
      { label: "Nearby help", to: "/nearby" },
      { label: "Safety Journal", to: "/blog" },
    ],
  },
  {
    title: "Safety & support",
    links: [
      { label: "Emergency & safety notice", to: "/safety" },
      { label: "Help & FAQ", to: "/help" },
      { label: "Contact support", to: "/contact" },
      { label: "About Allma", to: "/about" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy policy", to: "/privacy" },
      { label: "Terms of service", to: "/terms" },
      { label: "Cookies & storage", to: "/cookies" },
      { label: "Data & account deletion", to: "/data-requests" },
    ],
  },
] as const;

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("no-print border-t border-border/60 bg-card/40", className)}>
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_2fr]">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <BrandMark />
              <div className="leading-tight">
                <p className="font-display text-sm font-semibold tracking-tight">Allma Safety AI</p>
                <p className="text-[11px] text-muted-foreground">Community safety assistant</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Allma helps people prepare for emergencies, alert people they trust, and find real help
              nearby — calmly and quickly.
            </p>
            <p className="mt-4 flex items-start gap-2 rounded-2xl border border-destructive/25 bg-destructive/5 p-3 text-[12px] leading-relaxed text-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>
                Allma is an independent platform and is not an official emergency service. In a
                life-threatening emergency, always contact official emergency services directly.
              </span>
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {GROUPS.map((group) => (
              <nav key={group.title} aria-label={group.title}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {group.title}
                </p>
                <ul className="mt-3 space-y-2">
                  {group.links.map((link) => (
                    <li key={link.to}>
                      <Link
                        to={link.to}
                        className="text-sm text-foreground/80 transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border/60 pt-6 text-[12px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Allma Safety AI. All rights reserved.</p>
          <p>Built for communities in Uganda and beyond.</p>
        </div>
      </div>
    </footer>
  );
}
