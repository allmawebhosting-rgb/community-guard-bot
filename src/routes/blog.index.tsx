import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, BookOpen, Clock, ShieldCheck, Sparkles } from "lucide-react";
import { BLOG_POSTS } from "@/lib/blog-posts";

export const Route = createFileRoute("/blog/")({
  component: BlogIndex,
});

function BlogIndex() {
  const featured = BLOG_POSTS[0];

  return (
    <main className="min-h-screen bg-[#f3efe8] text-[#171817]">
      <header className="sticky top-0 z-30 border-b border-[#231f1a]/10 bg-[#f3efe8]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/" className="font-display text-sm font-black tracking-[0.1em] text-[#171817]">
            ALLMA <span className="text-[#b22d32]">/</span> SAFETY AI
          </Link>
          <div className="hidden items-center gap-6 text-[11px] font-bold uppercase tracking-[0.18em] text-[#5d6057] sm:flex">
            <Link to="/blog" className="transition hover:text-[#171817]">Guides</Link>
            <Link to="/" className="transition hover:text-[#171817]">Home</Link>
          </div>
          <Link to="/" className="inline-flex items-center gap-2 rounded-full border border-[#231f1a]/10 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#171817] transition hover:border-[#b22d32]/30 hover:text-[#b22d32]">
            Back to Allma
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(178,45,50,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(244,200,66,0.2),transparent_32%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#b22d32]/20 bg-[#fffdf9] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-[#b22d32]">
              <BookOpen className="h-3.5 w-3.5" />
              The Safety Journal
            </div>
            <h1 className="max-w-3xl font-display text-5xl font-black leading-[0.94] tracking-[-0.05em] text-[#171817] sm:text-6xl lg:text-7xl">
              Clear thinking for difficult moments.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-[#5d6057] sm:text-lg">
              Original guides for parents, professionals, travellers and communities who need calm, practical answers before a crisis hits.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/blog/$slug" params={{ slug: featured.slug }} className="inline-flex items-center gap-2 rounded-full bg-[#171817] px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] text-white transition hover:bg-[#b22d32]">
                Read featured guide
                <ArrowRight className="h-4 w-4" />
              </Link>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#171817]/10 bg-white/70 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-[#5d6057]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#b22d32]" />
                Practical, not alarmist
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[30px] border border-[#171817]/10 bg-white shadow-[0_20px_80px_-30px_rgba(21,19,16,0.4)]">
            <div className="border-b border-[#171817]/10">
              <img src={featured.featuredImage} alt={featured.title} className="h-[280px] w-full object-cover sm:h-[360px]" />
            </div>
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#77796e]">
                <span>{featured.category}</span>
                <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {featured.readMinutes} min read</span>
              </div>
              <h2 className="font-display text-2xl font-black leading-tight tracking-[-0.04em] text-[#171817]">{featured.title}</h2>
              <p className="mt-3 text-sm leading-7 text-[#5d6057]">{featured.excerpt}</p>
              <Link to="/blog/$slug" params={{ slug: featured.slug }} className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#b22d32] transition hover:text-[#7a1e22]">
                Read the guide <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-12 pt-8 sm:px-8 sm:pb-16">
        <div className="mb-8 flex flex-col gap-3 border-b border-[#171817]/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#77796e]">Latest guides</p>
            <h2 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] text-[#171817]">Explore the journal</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#171817]/10 bg-white/70 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#5d6057]">
            <Sparkles className="h-3.5 w-3.5 text-[#b22d32]" />
            {BLOG_POSTS.length} original guides
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {BLOG_POSTS.map((post) => (
            <article key={post.slug} className="group overflow-hidden rounded-[28px] border border-[#171817]/10 bg-white shadow-[0_18px_50px_-30px_rgba(17,24,39,0.25)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_70px_-28px_rgba(17,24,39,0.35)]">
              <div className="relative overflow-hidden border-b border-[#171817]/10">
                <img src={post.featuredImage} alt={post.title} className="h-52 w-full object-cover transition duration-700 group-hover:scale-[1.03]" />
                <span className="absolute left-4 top-4 rounded-full border border-white/40 bg-[#171817]/70 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white backdrop-blur-sm">
                  {post.category}
                </span>
              </div>

              <div className="flex h-[calc(100%-13rem)] flex-col p-5">
                <div className="mb-3 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#77796e]">
                  <span>{post.author}</span>
                  <span>{post.publishedAt}</span>
                </div>

                <h3 className="font-display text-2xl font-black leading-[1.05] tracking-[-0.04em] text-[#171817]">{post.title}</h3>
                <p className="mt-3 flex-1 text-sm leading-7 text-[#5d6057]">{post.excerpt}</p>

                <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#171817]/10 pt-4">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#77796e]">
                    <Clock className="h-3.5 w-3.5" />
                    {post.readMinutes} min read
                  </span>
                  <Link to="/blog/$slug" params={{ slug: post.slug }} className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#b22d32] transition group-hover:text-[#7a1e22]">
                    Read article <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-[#171817]/10 bg-[#171817] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-12 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#f4c842]">Need a calmer plan?</p>
            <h3 className="mt-2 font-display text-3xl font-black tracking-[-0.04em]">Build safer routines before the emergency starts.</h3>
          </div>
          <Link to="/" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#171817] transition hover:bg-[#f4c842]">
            Explore Allma <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
