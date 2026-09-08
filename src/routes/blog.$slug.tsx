import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ArrowUpRight, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
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
    <main className="min-h-screen bg-[#f3efe8] text-[#171817]">
      <header className="border-b border-[#171817]/10 bg-[#171817] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/blog" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-white/75 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            All guides
          </Link>
          <Link to="/" className="font-display text-sm font-black tracking-[0.1em] text-white">
            ALLMA <span className="text-[#f4c842]">/</span> SAFETY AI
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-6xl px-5 pb-16 pt-8 sm:px-8 sm:pb-20 sm:pt-10">
        <div className="mb-8 flex flex-wrap items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#77796e]">
          <span className="rounded-full bg-[#fffdf9] px-3 py-1.5 text-[#b22d32] ring-1 ring-[#171817]/10">{post.category}</span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {post.readMinutes} min read
          </span>
          <span>{post.publishedAt}</span>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <header className="pb-8">
              <h1 className="max-w-4xl font-display text-4xl font-black leading-[0.95] tracking-[-0.05em] text-[#171817] sm:text-5xl lg:text-6xl">{post.title}</h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-[#5d6057]">{post.excerpt}</p>
              <div className="mt-6 flex flex-wrap items-center gap-4 text-xs font-bold text-[#77796e]">
                <span className="inline-flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-[#b22d32]" /> {post.author}</span>
                <span className="h-1 w-1 rounded-full bg-[#b22d32]" />
                <span>Original Allma guide</span>
              </div>
            </header>

            <div className="overflow-hidden rounded-[30px] border border-[#171817]/10 bg-white shadow-[0_18px_60px_-36px_rgba(17,24,39,0.35)]">
              <img src={post.featuredImage} alt={post.title} className="h-[280px] w-full object-cover sm:h-[420px]" />
            </div>

            <div className="pt-10">
              {post.sections.map((section, index) => (
                <section key={section.heading} id={`section-${index}`} className="scroll-mt-24 pb-10 last:pb-0">
                  <h2 className="font-display text-2xl font-black leading-tight tracking-[-0.04em] text-[#171817] sm:text-3xl">{section.heading}</h2>
                  <div className="mt-5 space-y-5 text-[15px] leading-8 text-[#4f524b] sm:text-base">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                  {section.bullets && (
                    <ul className="mt-6 space-y-3 border-l-2 border-[#f4c842] pl-5 text-sm font-bold leading-6 text-[#2b2d2a]">
                      {section.bullets.map((bullet) => (
                        <li key={bullet} className="flex gap-2">
                          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#b22d32]" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>

            <div className="mt-8 rounded-[28px] border border-[#171817]/10 bg-[#fffdf9] p-6 sm:p-8">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#77796e]">Important note</p>
              <p className="mt-3 text-sm leading-7 text-[#4f524b]">
                This guide is general information, not a substitute for official emergency services, professional medical advice or direct confirmation from a facility.
              </p>
            </div>
          </div>

          <aside className="lg:pt-8">
            <div className="rounded-[26px] border border-[#171817]/10 bg-white p-5 shadow-[0_18px_50px_-30px_rgba(17,24,39,0.25)] lg:sticky lg:top-20">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#77796e]">In this guide</p>
              <ol className="mt-5 space-y-3 text-sm font-bold leading-6 text-[#55584f]">
                {post.sections.map((section, index) => (
                  <li key={section.heading}>
                    <a href={`#section-${index}`} className="flex items-start gap-3 rounded-2xl px-2 py-2 transition hover:bg-[#f3efe8] hover:text-[#171817]">
                      <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#f4c842] text-[10px] text-[#171817]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>{section.heading}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-6 rounded-[26px] border border-[#171817]/10 bg-[#171817] p-5 text-white shadow-[0_18px_50px_-30px_rgba(17,24,39,0.35)]">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#f4c842]">Need help now?</p>
              <p className="mt-3 text-sm leading-7 text-white/80">Use the app to contact trusted people, review nearby help, and keep your safety plan ready.</p>
              <Link to="/" className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#171817] transition hover:bg-[#f4c842]">
                Explore Allma <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </aside>
        </div>
      </article>

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
                <img src={item.featuredImage} alt={item.title} className="h-44 w-full object-cover" />
                <div className="p-5">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#b22d32]">{item.category}</p>
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
    </main>
  );
}
