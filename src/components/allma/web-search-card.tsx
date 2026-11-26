import { ExternalLink, Globe, Loader2 } from "lucide-react";

export type WebSearchSource = {
  title?: string;
  link?: string;
  snippet?: string;
  source?: string;
  published?: string | null;
};

function safeHttpLink(link: string | undefined): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function webSearchSources(output: Record<string, unknown> | undefined): Array<WebSearchSource & { href: string }> {
  const rows = Array.isArray(output?.results) ? (output.results as WebSearchSource[]) : [];
  return rows
    .map((row) => ({ ...row, href: safeHttpLink(row.link) }))
    .filter((row): row is WebSearchSource & { href: string } => Boolean(row.href));
}

/** Source chips under a live-search answer. The reply text carries the summary. */
export function WebSearchCard({
  running,
  output,
}: {
  running?: boolean;
  output?: Record<string, unknown>;
}) {
  if (running) {
    return (
      <div role="status" className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Searching Google…
      </div>
    );
  }
  const sources = webSearchSources(output);
  if (!sources.length) return null;
  return (
    <section aria-label="Sources" className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Globe className="size-3" aria-hidden />
        Sources
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {sources.map((source, index) => (
          <li key={source.href} className="min-w-0 max-w-full">
            <a
              href={source.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              title={source.snippet || source.title}
              className="flex max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs shadow-sm transition hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                {index + 1}
              </span>
              <span className="min-w-0 truncate">
                <span className="font-medium">{source.source}</span>
                {source.title ? <span className="text-muted-foreground"> · {source.title}</span> : null}
              </span>
              <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
