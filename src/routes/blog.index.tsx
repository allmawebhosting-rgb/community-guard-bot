import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen, Clock, ShieldCheck } from "lucide-react";
import { BLOG_POSTS } from "@/lib/blog-posts";

export const Route = createFileRoute("/blog/")({
  component: BlogIndex,
});

const accents: Record<string, string> = {
  red: "from-red-600/20 via-red-500/5 to-transparent",
  gold: "from-amber-400/25 via-yellow-300/8 to-transparent",
  blue: "from-sky-500/20 via-blue-400/5 to-transparent",
  green: "from-emerald-500/20 via-lime-300/5 to-transparent",
};

function BlogIndex() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f8f7f3] text-[#171817]">
      <div className="border-b border-[#1c1f1d]/10 bg-[#171817] text-[#f8f7f3]"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8"><Link to="/" className="font-display text-sm font-black tracking-[0.08em]">ALLMA <span className="text-[#f4c842]">/</span> SAFETY AI</Link><Link to="/" className="text-xs font-bold text-white/65 transition hover:text-white">Back to Allma</Link></div></div>
      <section className="relative border-b border-[#1c1f1d]/10 bg-[radial-gradient(circle_at_80%_10%,rgba(244,200,66,0.25),transparent_28%),linear-gradient(135deg,#f8f7f3,#ecebe3)]"><div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:py-24"><div><p className="mb-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-[#b22d32]"><BookOpen className="h-3.5 w-3.5" /> The Safety Journal</p><h1 className="max-w-4xl font-display text-5xl font-black leading-[0.96] tracking-[-0.04em] sm:text-7xl">Clearer thinking for difficult moments.</h1><p className="mt-6 max-w-2xl text-base leading-8 text-[#55584f] sm:text-lg">Original guides on emergency preparation, nearby help, trusted contacts and safer digital response in Uganda.</p></div><div className="border-l-2 border-[#b22d32] pl-5 lg:mb-2"><ShieldCheck className="h-7 w-7 text-[#b22d32]" /><p className="mt-4 text-sm font-bold leading-6">Useful before the alert. Calm during the alert. Honest about what technology can and cannot know.</p></div></div></section>
      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16"><div className="mb-8 flex items-end justify-between gap-4 border-b border-[#1c1f1d]/15 pb-4"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#77796e]">Latest guides</p><h2 className="mt-2 font-display text-2xl font-black sm:text-3xl">Explore the journal</h2></div><span className="text-xs font-bold text-[#77796e]">{BLOG_POSTS.length} original guides</span></div><div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{BLOG_POSTS.map((post, index) => <article key={post.slug} className="group flex min-h-[330px] flex-col overflow-hidden border border-[#1c1f1d]/10 bg-white shadow-[0_12px_30px_rgba(23,24,23,0.06)] transition hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(23,24,23,0.12)]"><div className={`relative flex h-32 items-end bg-gradient-to-br ${accents[post.accent] ?? accents.red} p-5`}><span className="font-display text-5xl font-black text-[#171817]/10">{String(index + 1).padStart(2, "0")}</span><span className="absolute right-4 top-4 text-[10px] font-black uppercase tracking-[0.16em] text-[#55584f]">{post.category}</span></div><div className="flex flex-1 flex-col p-5"><h3 className="font-display text-xl font-black leading-tight">{post.title}</h3><p className="mt-3 line-clamp-3 text-sm leading-6 text-[#62645b]">{post.excerpt}</p><div className="mt-auto flex items-center justify-between gap-3 pt-6 text-[11px] font-bold text-[#77796e]"><span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {post.readMinutes} min read</span><Link to="/blog/$slug" params={{ slug: post.slug }} className="inline-flex items-center gap-1 text-[#b22d32] transition group-hover:gap-2">Read guide <ArrowUpRight className="h-3.5 w-3.5" /></Link></div></div></article>)}</div></section>
      <footer className="border-t border-[#1c1f1d]/10 bg-[#171817] px-5 py-8 text-center text-xs text-white/55 sm:px-8">Allma Safety AI · Practical safety guidance for Uganda</footer>
    </main>
  );
}
