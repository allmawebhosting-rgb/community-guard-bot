import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ArrowUpRight, Clock, ShieldCheck } from "lucide-react";
import { BLOG_POSTS, blogHeadingId, getBlogPost } from "@/lib/blog-posts";
import {
  ArticleCTA,
  ArticleProgress,
  ArticleTableOfContents,
  AuthorCard,
  ComparisonTable,
  ArticleRail,
  FeatureShowcase,
  FeatureSplit,
  InsightCallout,
  ShareBar,
} from "@/components/blog/article-components";

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const post = getBlogPost(params.slug);
    if (!post) throw notFound();
    return { post };
  },
  head: ({ loaderData }) => ({
    meta: loaderData ? [
      { title: `${loaderData.post.metaTitle ?? loaderData.post.title} — Allma Safety AI` },
      { name: "description", content: loaderData.post.metaDescription ?? loaderData.post.excerpt },
      { property: "og:title", content: loaderData.post.metaTitle ?? loaderData.post.title },
      { property: "og:description", content: loaderData.post.metaDescription ?? loaderData.post.excerpt },
      { property: "og:image", content: loaderData.post.featuredImage },
      { property: "og:type", content: "article" },
      { property: "og:url", content: `https://allmasafetyai.online/blog/${loaderData.post.slug}` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: loaderData.post.metaTitle ?? loaderData.post.title },
      { name: "twitter:description", content: loaderData.post.metaDescription ?? loaderData.post.excerpt },
      { name: "twitter:image", content: loaderData.post.featuredImage },
    ] : [{ title: "Safety guide — Allma Safety AI" }],
    links: loaderData ? [
      { rel: "canonical", href: `https://allmasafetyai.online/blog/${loaderData.post.slug}` },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;700;800&family=IBM+Plex+Mono:wght@400;600;700&family=Source+Serif+4:wght@400;500;600;700&display=swap" },
    ] : [],
  }),
  component: BlogArticle,
});

const featureImages = {
  sos: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
  network: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80",
  location: "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80",
};

function BlogArticle() {
  const { post } = Route.useLoaderData();
  const currentIndex = BLOG_POSTS.findIndex((item) => item.slug === post.slug);
  const previous = currentIndex > 0 ? BLOG_POSTS[currentIndex - 1] : undefined;
  const next = currentIndex < BLOG_POSTS.length - 1 ? BLOG_POSTS[currentIndex + 1] : undefined;
  const related = BLOG_POSTS.filter((item) => item.slug !== post.slug && item.category === post.category).concat(BLOG_POSTS.filter((item) => item.slug !== post.slug && item.category !== post.category)).slice(0, 3);
  const features = [
    { name: "Allma SOS", category: "Emergency activation", description: "A clear starting point for a configured safety response flow when a user needs support.", href: "/sos", image: featureImages.sos, benefits: ["Clear SOS activation", "Configured trusted contacts", "Structured response information"] },
    { name: "Safety Network", category: "Trusted support", description: "Organise the people who should understand your safety plan and receive relevant updates.", href: "/profile", image: featureImages.network, benefits: ["Trusted contact planning", "Consent-aware sharing", "A calmer response path"] },
    { name: "Nearby help", category: "Local orientation", description: "Use the nearby experience to orient yourself towards listed hospitals, police stations and other help locations.", href: "/nearby", image: featureImages.location, benefits: ["Location-aware search", "Useful place context", "A practical route starting point"] },
  ];
  const showcase = post.slug === "allma-safety-ai" ? features[0] : post.slug === "uganda-safety-app" ? features[2] : features[1];

  return (
    <main className="journal-page journal-article min-h-screen">
      <ArticleProgress />
      <header className="journal-header">
        <div className="journal-container flex items-center justify-between gap-4 py-4 sm:py-5">
          <Link to="/blog" className="journal-text-link"><ArrowLeft className="h-4 w-4" /> Safety Journal</Link>
          <Link to="/" className="journal-wordmark">ALLMA <span>/</span> SAFETY AI</Link>
        </div>
      </header>
      <section className="mx-auto min-w-0 max-w-7xl px-4 pb-10 pt-12 sm:px-8 sm:pb-14 sm:pt-20">
        <div className="max-w-4xl">
          <p className="journal-label text-[var(--journal-red)]">{post.category} · Uganda safety intelligence</p>
          <h1 className="journal-display mt-5 max-w-5xl break-words">{post.title}</h1>
          <p className="journal-deck mt-7">{post.excerpt}</p>
          <div className="journal-meta mt-8 flex flex-wrap items-center gap-x-5 gap-y-3"><span className="inline-flex items-center gap-2 font-bold text-[var(--journal-ink)]"><ShieldCheck className="h-4 w-4 text-[var(--journal-red)]" />{post.author}</span><span>{post.publishedAt}</span><span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{post.readMinutes} min read</span></div>
        </div>
        <figure className="mt-10 overflow-hidden border-y border-[var(--journal-rule)] bg-[var(--journal-paper-deep)] sm:mt-16"><img src={post.featuredImage} alt={post.featuredImageAlt ?? post.title} fetchPriority="high" className="aspect-[1.35/1] max-h-[560px] w-full object-cover sm:aspect-[2/1]" /><figcaption className="journal-label px-4 py-3">A practical perspective from the Allma Safety AI journal.</figcaption></figure>
      </section>
      <div className="mx-auto min-w-0 max-w-7xl px-4 sm:px-8"><ArticleTableOfContents sections={post.sections} /></div>
      <div className="mx-auto grid min-w-0 max-w-7xl gap-10 px-4 pb-20 pt-8 sm:px-8 lg:grid-cols-[minmax(0,760px)_250px] lg:justify-between lg:gap-20">
        <article className="min-w-0">
          <div className="mb-9 max-w-[760px]"><ShareBar /></div>
          <div className="min-w-0 max-w-[760px]">
            {post.sections.map((section, index) => (
              <section key={section.heading} className={`pb-14 ${index > 0 ? "pt-12" : ""}`}>
                <p className="journal-label mb-3 text-[var(--journal-red)]">{String(index + 1).padStart(2, "0")}</p>
                <h2 id={blogHeadingId(section.heading)} className="group flex items-start gap-3">{section.heading}<a className="journal-anchor mt-1" href={`#${blogHeadingId(section.heading)}`} aria-label={`Copy link to ${section.heading}`}><Copy className="h-4 w-4" /></a></h2>
                <div className="mt-6 space-y-6 text-[16px] leading-8 text-[#4f524b]">{section.paragraphs.map((paragraph) => <p key={paragraph}>{linkConcepts(paragraph)}</p>)}</div>
                {section.bullets && <ul className="mt-8 space-y-3 border-l-2 border-[#e2b84c] pl-5 text-sm font-bold leading-7 text-[#2b2d2a]">{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
                {index === 0 && <InsightCallout label="Key takeaway">During an emergency, clarity matters more than complexity.</InsightCallout>}
                {index === 1 && <ComparisonTable rows={[["SOS activation", "Provides a clear way to begin a configured response flow"], ["Safety Network", "Organises trusted people who may need relevant information"], ["Nearby help", "Supports local orientation when a person needs a place to start"]]} />}
                {index === 2 && <FeatureShowcase feature={showcase} />}
                {index === 3 && <FeatureSplit feature={features[post.slug === "uganda-safety-app" ? 0 : 2]} reverse />}
              </section>
            ))}
          </div>
          <ArticleCTA post={post} />
          <div className="space-y-8"><div className="border-l-2 border-[#c63d3f] bg-[#fffdf9] px-6 py-5"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c63d3f]">Important note</p><p className="mt-2 text-sm leading-7 text-[#5d6057]">{post.disclaimer ?? "This guide is general information and does not replace official emergency services, professional medical advice, or direct confirmation from a service provider."}</p></div><AuthorCard post={post} /></div>
        </article>
        <ArticleRail sections={post.sections} feature={showcase} />
      </div>

      <nav aria-label="Article navigation" className="journal-container grid gap-4 border-t border-[var(--journal-rule)] py-8 sm:grid-cols-2">
        {previous ? <Link to="/blog/$slug" params={{ slug: previous.slug }} className="border-l-2 border-[var(--journal-gold)] p-4"><span className="journal-label">Previous article</span><span className="mt-2 block font-display text-lg font-bold">{previous.title}</span></Link> : <span />}
        {next ? <Link to="/blog/$slug" params={{ slug: next.slug }} className="border-l-2 border-[var(--journal-red)] p-4 sm:text-right"><span className="journal-label">Next article</span><span className="mt-2 block font-display text-lg font-bold">{next.title}</span></Link> : <span />}
      </nav>

      <section className="border-t border-[#171817]/10 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#77796e]">Continue reading</p>
              <h2 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] text-[#171817]">More practical guidance</h2>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {related.map((item) => (
              <Link key={item.slug} to="/blog/$slug" params={{ slug: item.slug }} className="group overflow-hidden rounded-[24px] border border-[#171817]/10 bg-[#f8f5f1] transition hover:-translate-y-1 hover:border-[#b22d32]/30 hover:shadow-[0_18px_40px_-28px_rgba(17,24,39,0.35)]">
                <img src={item.featuredImage} alt={item.featuredImageAlt ?? item.title} loading="lazy" className="h-44 w-full object-cover" />
                <div className="p-5">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#b22d32]">{item.category} · {item.readMinutes} min read</p>
                  <h3 className="mt-3 font-display text-xl font-black leading-tight tracking-[-0.03em] text-[#171817]">{item.title}</h3>
                  <span className="mt-4 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#5d6057] group-hover:text-[#b22d32]">
                    Read next <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "Article", headline: post.title, description: post.metaDescription ?? post.excerpt, image: post.featuredImage, author: { "@type": "Organization", name: post.author }, publisher: { "@type": "Organization", name: "Allma Safety AI", url: "https://allmasafetyai.online" }, datePublished: post.publishedAt, mainEntityOfPage: `https://allmasafetyai.online/blog/${post.slug}` }) }} />
    </main>
  );
}

function linkConcepts(text: string) {
  const concepts = [["Safety Network", "/"], ["location sharing", "/nearby"], ["emergency SOS app", "/sos"], ["emergency calls", "/calls"], ["health reminders", "/health-reminders"], ["Emergency Chat", "/chat"]];
  for (const [label, href] of concepts) {
    const index = text.toLowerCase().indexOf(label.toLowerCase());
    if (index >= 0) return <>{text.slice(0, index)}<a href={href} className="font-semibold text-[#c63d3f] underline decoration-[#c63d3f]/30 underline-offset-4 hover:decoration-[#c63d3f]">{text.slice(index, index + label.length)}</a>{text.slice(index + label.length)}</>;
  }
  return text;
}
