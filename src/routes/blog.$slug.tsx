import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { BLOG_POSTS, getBlogPost } from "@/lib/blog-posts";

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const post = getBlogPost(params.slug);
    if (!post) throw notFound();
    return { post };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.post.title} — Allma Safety AI` : "Safety guide — Allma Safety AI" },
      { name: "description", content: loaderData?.post.excerpt ?? "Practical safety guidance from Allma Safety AI." },
    ],
  }),
  component: BlogArticle,
});

function BlogArticle() {
  const { post } = Route.useLoaderData();
  const related = BLOG_POSTS.filter((item) => item.slug !== post.slug).slice(0, 3);

  return (
    <main className="min-h-screen bg-[#f8f7f3] text-[#171817]">
      <div className="border-b border-[#1c1f1d]/10 bg-[#171817] text-[#f8f7f3]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/blog" className="inline-flex items-center gap-2 text-xs font-bold text-white/70 transition hover:text-white"><ArrowLeft className="h-4 w-4" /> All guides</Link>
          <Link to="/" className="font-display text-sm font-black tracking-[0.08em]">ALLMA <span className="text-[#f4c842]">/</span> SAFETY AI</Link>
        </div>
      </div>

      <article className="mx-auto max-w-5xl px-5 pb-20 sm:px-8">
        <header className="border-b border-[#1c1f1d]/12 py-14 sm:py-20">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#b22d32]">{post.category}</p>
          <h1 className="mt-5 max-w-4xl font-display text-4xl font-black leading-[0.98] tracking-[-0.035em] sm:text-6xl">{post.title}</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-[#5d6057]">{post.excerpt}</p>
          <div className="mt-7 flex flex-wrap items-center gap-4 text-xs font-bold text-[#77796e]"><span>8 Sept 2026</span><span className="h-1 w-1 rounded-full bg-[#b22d32]" /><span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {post.readMinutes} min read</span><span className="h-1 w-1 rounded-full bg-[#b22d32]" /><span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Original Allma guide</span></div>
        </header>

        <div className="grid gap-12 py-12 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-20 lg:py-16">
          <div className="min-w-0">
            {post.sections.map((section, index) => (
              <section key={section.heading} id={`section-${index}`} className="mb-12 last:mb-0">
                <h2 className="font-display text-2xl font-black leading-tight sm:text-3xl">{section.heading}</h2>
                <div className="mt-5 space-y-5 text-[15px] leading-8 text-[#4f524b] sm:text-base">
                  {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
                {section.bullets && <ul className="mt-6 space-y-3 border-l-2 border-[#f4c842] pl-5 text-sm font-bold leading-6 text-[#30322e]">{section.bullets.map((bullet) => <li key={bullet} className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#b22d32]" />{bullet}</li>)}</ul>}
              </section>
            ))}
            <div className="mt-14 border-t border-[#1c1f1d]/12 pt-6 text-xs leading-6 text-[#77796e]">This guide is general information, not a substitute for official emergency services, professional medical advice or direct confirmation from a facility.</div>
          </div>
          <aside className="h-fit border-t-2 border-[#b22d32] pt-4 lg:sticky lg:top-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#77796e]">In this guide</p>
            <ol className="mt-4 space-y-3 text-sm font-bold leading-5 text-[#55584f]">{post.sections.map((section, index) => <li key={section.heading}><a href={`#section-${index}`} className="transition hover:text-[#b22d32]">{String(index + 1).padStart(2, "0")} {section.heading}</a></li>)}</ol>
          </aside>
        </div>
      </article>

      <section className="border-t border-[#1c1f1d]/10 bg-white px-5 py-12 sm:px-8 sm:py-16"><div className="mx-auto max-w-5xl"><p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#77796e]">Continue reading</p><div className="mt-5 grid gap-4 md:grid-cols-3">{related.map((item) => <Link key={item.slug} to="/blog/$slug" params={{ slug: item.slug }} className="group border border-[#1c1f1d]/10 p-5 transition hover:border-[#b22d32]/40 hover:shadow-[0_12px_30px_rgba(23,24,23,0.08)]"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#b22d32]">{item.category}</p><h3 className="mt-3 font-display text-lg font-black leading-tight">{item.title}</h3><span className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-[#77796e] group-hover:text-[#b22d32]">Read next <ArrowUpRight className="h-3.5 w-3.5" /></span></Link>)}</div></div></section>
    </main>
  );
}
