/**
 * Live web search for chat. Plain fetch only, so it runs on Cloudflare Workers.
 * Providers, first configured wins: Serper.dev (Google results), Google Custom Search, Tavily.
 */

export interface SearchResultItem {
  title: string;
  link: string;
  snippet: string;
  source?: string;
  publishedDate?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
  answerBox?: string;
  success: boolean;
  error?: string;
}

const REQUEST_TIMEOUT_MS = 8_000;
export const SEARCH_NOT_CONFIGURED = "SEARCH_NOT_CONFIGURED";

function runtimeEnv(name: string): string {
  const fromProcess = (process.env[name] || "").trim();
  if (fromProcess) return fromProcess;
  const cf = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  const fromCf = cf?.[name];
  return typeof fromCf === "string" ? fromCf.trim() : "";
}

export function isWebSearchConfigured(): boolean {
  return Boolean(
    runtimeEnv("SERPER_API_KEY") ||
      (runtimeEnv("GOOGLE_SEARCH_API_KEY") && runtimeEnv("GOOGLE_SEARCH_ENGINE_ID")) ||
      runtimeEnv("TAVILY_API_KEY"),
  );
}

function hostOf(link: string): string | null {
  try {
    const url = new URL(link);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Keeps only http(s) links, drops duplicates and empty rows, and fills in the source host. */
export function normalizeResults(rows: unknown[], limit: number): SearchResultItem[] {
  const seen = new Set<string>();
  const out: SearchResultItem[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const link = clean(item.link ?? item.url, 600);
    const host = hostOf(link);
    const title = clean(item.title, 160);
    if (!host || !title || seen.has(link)) continue;
    seen.add(link);
    out.push({
      title,
      link,
      snippet: clean(item.snippet ?? item.content, 320),
      source: clean(item.source, 60) || host,
      publishedDate: clean(item.date ?? item.publishedDate ?? item.published_date, 40) || undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function viaSerper(query: string, num: number, gl: string): Promise<SearchResponse | null> {
  const key = runtimeEnv("SERPER_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num, gl }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("[web-search] serper status", res.status);
      return null;
    }
    const data = (await res.json()) as {
      organic?: unknown[];
      answerBox?: { answer?: string; snippet?: string };
    };
    return {
      query,
      results: normalizeResults(data.organic ?? [], num),
      answerBox: clean(data.answerBox?.answer ?? data.answerBox?.snippet, 400) || undefined,
      success: true,
    };
  } catch (error) {
    console.error("[web-search] serper error", error instanceof Error ? error.message : "unknown");
    return null;
  }
}

async function viaGoogleCustomSearch(query: string, num: number, gl: string): Promise<SearchResponse | null> {
  const key = runtimeEnv("GOOGLE_SEARCH_API_KEY");
  const cx = runtimeEnv("GOOGLE_SEARCH_ENGINE_ID");
  if (!key || !cx) return null;
  try {
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", key);
    url.searchParams.set("cx", cx);
    url.searchParams.set("q", query);
    url.searchParams.set("num", String(Math.min(num, 10)));
    url.searchParams.set("gl", gl);
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) {
      console.error("[web-search] google cse status", res.status);
      return null;
    }
    const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
    const rows = (data.items ?? []).map((item) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      source: item.displayLink,
    }));
    return { query, results: normalizeResults(rows, num), success: true };
  } catch (error) {
    console.error("[web-search] google cse error", error instanceof Error ? error.message : "unknown");
    return null;
  }
}

async function viaTavily(query: string, num: number): Promise<SearchResponse | null> {
  const key = runtimeEnv("TAVILY_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, max_results: num, include_answer: true, search_depth: "basic" }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("[web-search] tavily status", res.status);
      return null;
    }
    const data = (await res.json()) as { results?: unknown[]; answer?: string };
    return {
      query,
      results: normalizeResults(data.results ?? [], num),
      answerBox: clean(data.answer, 400) || undefined,
      success: true,
    };
  } catch (error) {
    console.error("[web-search] tavily error", error instanceof Error ? error.message : "unknown");
    return null;
  }
}

export async function executeGoogleSearch(
  query: string,
  options?: { numResults?: number; country?: string },
): Promise<SearchResponse> {
  const q = query.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!q) return { query, results: [], success: false, error: "EMPTY_QUERY" };
  const num = Math.min(Math.max(options?.numResults ?? 5, 1), 10);
  const gl = (options?.country ?? "ug").toLowerCase();

  if (!isWebSearchConfigured()) {
    return {
      query: q,
      results: [],
      success: false,
      error: `${SEARCH_NOT_CONFIGURED}: Add SERPER_API_KEY, GOOGLE_SEARCH_API_KEY with GOOGLE_SEARCH_ENGINE_ID, or TAVILY_API_KEY as a Worker secret.`,
    };
  }

  const found =
    (await viaSerper(q, num, gl)) ??
    (await viaGoogleCustomSearch(q, num, gl)) ??
    (await viaTavily(q, num));
  return found ?? { query: q, results: [], success: false, error: "SEARCH_FAILED: the search provider did not respond." };
}
