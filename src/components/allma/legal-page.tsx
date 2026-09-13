import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BrandLockup } from "@/components/allma/brand";
import { SiteFooter } from "@/components/allma/site-footer";

export type InfoSection = {
  id: string;
  title: string;
  body: ReactNode;
};

export function InfoPage({
  eyebrow,
  title,
  intro,
  updated,
  sections,
  footnote,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  updated?: string;
  sections: InfoSection[];
  footnote?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Link to="/" aria-label="Allma Safety AI home">
            <BrandLockup />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3.5 py-2 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Allma
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-6 shadow-soft sm:p-10">
          <div className="signal-streak pointer-events-none absolute inset-0 opacity-50" />
          <div className="relative max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {eyebrow}
            </p>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {title}
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{intro}</p>
            {updated && (
              <p className="mt-5 inline-flex rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                Last updated {updated}
              </p>
            )}
          </div>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[220px_1fr] lg:items-start">
          <nav
            aria-label="On this page"
            className="no-print hidden lg:sticky lg:top-24 lg:block rounded-2xl border border-border/60 bg-card/60 p-4"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              On this page
            </p>
            <ul className="mt-3 space-y-2">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block text-[13px] leading-snug text-foreground/75 transition-colors hover:text-foreground"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-6">
            {sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-24 rounded-3xl border border-border/60 bg-card p-6 shadow-soft sm:p-8"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[12px] text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2 className="font-display text-xl font-semibold tracking-tight">
                    {section.title}
                  </h2>
                </div>
                <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-foreground/85 [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_li]:leading-relaxed [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                  {section.body}
                </div>
              </section>
            ))}

            {footnote && (
              <div className="rounded-3xl border border-border/60 bg-accent/40 p-6 text-sm leading-relaxed text-foreground/85 sm:p-8">
                {footnote}
              </div>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
