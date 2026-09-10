import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, BookOpen, Clock, Search, ShieldCheck } from "lucide-react";
import { BLOG_POSTS } from "@/lib/blog-posts";

export const Route = createFileRoute("/blog/")({
  head: () => ({
    meta: [
      { title: "Safety Journal | Allma Safety AI" },
      { name: "description", content: "Practical safety guides for people, families and communities in Uganda." },
      { property: "og:title", content: "Safety Journal | Allma Safety AI" },
      { property: "og:description", content: "Practical safety guides for people, families and communities in Uganda." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://allmasafetyai.online/blog" },
      { property: "og:image", content: BLOG_POSTS[0]?.featuredImage ?? "" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "canonical", href: "https://allmasafetyai.online/blog" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;700;800&family=IBM+Plex+Mono:wght@400;600;700&family=Source+Serif+4:wght@400;500;600;700&display=swap" },
    ],
  }),
  component: BlogIndex,
});

function BlogIndex() {
  const featured = BLOG_POSTS[0];

  return (
    <main className="journal-page min-h-screen">
      <header className="journal-header">
        <div className="journal-container flex items-center justify-between gap-4 py-4 sm:py-5">
          <Link to="/" className="journal-wordmark">ALLMA <span>/</span> SAFETY AI</Link>
          <nav className="hidden items-center gap-6 journal-label sm:flex" aria-label="Journal navigation">
            <Link to="/blog" className="journal-nav-link">Journal</Link>
            <Link to="/" className="journal-nav-link">Allma home</Link>
          </nav>
          <Link to="/" className="journal-outline-button">Back to Allma</Link>
        </div>
      </header>

      <section className="journal-container grid gap-8 py-12 lg:grid-cols-[1fr_1.12fr] lg:items-end lg:py-20">
        <div className="max-w-xl">
          <div className="journal-kicker mb-5"><BookOpen className="h-3.5 w-3.5" /> The Safety Journal</div>
          <p className="journal-label mb-4">Issue 01 · Uganda and beyond</p>
          <h1 className="journal-display">Clear thinking for difficult moments.</h1>
          <p className="journal-deck mt-6">Original guides for parents, professionals, travellers and communities who need calm, practical answers before a crisis hits.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/blog/$slug" params={{ slug: featured.slug }} className="journal-button">Read featured guide <ArrowRight className="h-4 w-4" /></Link>
            <span className="journal-label inline-flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-[var(--journal-red)]" /> Practical, not alarmist</span>
          </div>
        </div>
        <article className="journal-featured">
          <div className="journal-featured-image"><img src={featured.featuredImage} alt={featured.featuredImageAlt ?? featured.title} /></div>
          <div className="p-5 sm:p-7">
            <div className="journal-meta mb-4"><span>{featured.category}</span><span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {featured.readMinutes} min</span></div>
            <h2 className="journal-card-title">{featured.title}</h2>
            <p className="journal-body mt-3">{featured.excerpt}</p>
            <Link to="/blog/$slug" params={{ slug: featured.slug }} className="journal-text-link mt-5">Read the guide <ArrowUpRight className="h-3.5 w-3.5" /></Link>
          </div>
        </article>
      </section>

      <section className="journal-rule-band">
        <div className="journal-container py-8 sm:py-12">
          <div className="flex flex-col gap-4 border-b border-[var(--journal-rule)] pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="journal-label">The archive</p><h2 className="journal-section-title mt-2">Explore the journal</h2></div>
            <div className="journal-search-note"><Search className="h-4 w-4" /> {BLOG_POSTS.length} original guides</div>
          </div>
          <div className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {BLOG_POSTS.slice(1).map((post) => (
              <article key={post.slug} className="journal-story group">
                <Link to="/blog/$slug" params={{ slug: post.slug }} className="block">
                  <div className="journal-story-image"><img src={post.featuredImage} alt={post.featuredImageAlt ?? post.title} loading="lazy" /></div>
                  <div className="mt-4"><div className="journal-meta"><span>{post.category}</span><span>{post.readMinutes} min read</span></div><h3 className="journal-story-title mt-3">{post.title}</h3><p className="journal-body mt-3 line-clamp-3">{post.excerpt}</p><span className="journal-text-link mt-4">Read article <ArrowUpRight className="h-3.5 w-3.5" /></span></div>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="journal-cta-band">
        <div className="journal-container flex flex-col gap-5 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="journal-label text-[var(--journal-gold)]">Need a calmer plan?</p><h3 className="journal-cta-title mt-2">Build safer routines before the emergency starts.</h3></div>
          <Link to="/" className="journal-light-button">Explore Allma <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </main>
  );
}
