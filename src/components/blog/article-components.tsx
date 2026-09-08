import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy, Linkedin, MessageCircle, Share2 } from "lucide-react";
import type { BlogPost, BlogSection } from "@/lib/blog-posts";

export type FeatureLink = {
  name: string;
  category: string;
  description: string;
  href: string;
  image: string;
  benefits: string[];
};

export function ArticleProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(100, Math.round((window.scrollY / max) * 100)) : 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return <div aria-hidden="true" className="fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent"><div className="h-full bg-[#c63d3f] transition-[width]" style={{ width: `${progress}%` }} /></div>;
}

export function ArticleTableOfContents({ sections }: { sections: BlogSection[] }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const nodes = sections.map((_, index) => document.getElementById(`section-${index}`)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) setActive(Number(entry.target.id.replace("section-", "")));
    }), { rootMargin: "-20% 0px -65%" });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [sections]);
  return <details className="group border-y border-[#171817]/10 py-3 lg:hidden"><summary className="flex cursor-pointer list-none items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-[#77796e]">On this page <span className="text-[#c63d3f]">{String(active + 1).padStart(2, "0")} / {String(sections.length).padStart(2, "0")}</span></summary><nav className="mt-4 grid gap-1 pb-2">{sections.map((section, index) => <a key={section.heading} href={`#section-${index}`} className="py-1 text-sm text-[#5d6057]">{String(index + 1).padStart(2, "0")} {section.heading}</a>)}</nav></details>;
}

export function DesktopTableOfContents({ sections }: { sections: BlogSection[] }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const nodes = sections.map((_, index) => document.getElementById(`section-${index}`)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => entry.isIntersecting && setActive(Number(entry.target.id.replace("section-", "")))), { rootMargin: "-18% 0px -68%" });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [sections]);
  return <aside className="sticky top-24 hidden self-start lg:block"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#77796e]">On this page</p><nav className="mt-5 border-l border-[#171817]/10">{sections.map((section, index) => <a key={section.heading} href={`#section-${index}`} className={`block border-l-2 py-2 pl-4 text-sm leading-5 transition ${active === index ? "-ml-px border-[#c63d3f] font-bold text-[#171817]" : "border-transparent text-[#77796e] hover:text-[#171817]"}`}>{String(index + 1).padStart(2, "0")} {section.heading}</a>)}</nav></aside>;
}

export function ArticleRail({ sections, feature }: { sections: BlogSection[]; feature: FeatureLink }) {
  return <aside className="hidden min-w-0 space-y-8 lg:block">
    <DesktopTableOfContents sections={sections} />
    <div className="border-t border-[#171817]/10 pt-7">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#77796e]">Inside Allma</p>
      <div className="mt-4 overflow-hidden border border-[#171817]/10 bg-white">
        <img src={feature.image} alt={`${feature.name} feature overview`} loading="lazy" className="aspect-[1.5/1] w-full object-cover" />
        <div className="p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#c63d3f]">{feature.category}</p>
          <h3 className="mt-2 font-display text-xl font-black tracking-[-0.03em] text-[#171817]">{feature.name}</h3>
          <p className="mt-2 text-sm leading-6 text-[#5d6057]">{feature.description}</p>
          <a href={feature.href} className="mt-4 inline-flex min-h-10 items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#c63d3f]">Explore feature <ArrowUpRight className="h-3.5 w-3.5" /></a>
        </div>
      </div>
    </div>
    <div className="border-t border-[#171817]/10 pt-7">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#77796e]">Start here</p>
      <nav className="mt-4 grid gap-2 text-sm font-bold text-[#3e403b]">
        <a href="/sos" className="flex items-center justify-between border-b border-[#171817]/10 py-2 hover:text-[#c63d3f]">Emergency SOS <ArrowUpRight className="h-3.5 w-3.5" /></a>
        <a href="/nearby" className="flex items-center justify-between border-b border-[#171817]/10 py-2 hover:text-[#c63d3f]">Nearby help <ArrowUpRight className="h-3.5 w-3.5" /></a>
        <a href="/profile" className="flex items-center justify-between border-b border-[#171817]/10 py-2 hover:text-[#c63d3f]">Safety contacts <ArrowUpRight className="h-3.5 w-3.5" /></a>
      </nav>
    </div>
  </aside>;
}

export function FeatureShowcase({ feature }: { feature: FeatureLink }) {
  return <section className="my-16 overflow-hidden border-y border-[#171817]/10 bg-[#171817] text-white"><div className="grid lg:grid-cols-[0.9fr_1.1fr]"><figure className="order-first min-h-[300px] bg-[#252624] lg:order-last"><img src={feature.image} alt={`${feature.name} feature illustration`} loading="lazy" className="h-full min-h-[300px] w-full object-cover opacity-90" /></figure><div className="flex flex-col justify-center p-7 sm:p-12"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e2b84c]">Allma feature · {feature.category}</p><h3 className="mt-4 font-display text-4xl font-black tracking-[-0.05em] sm:text-5xl">{feature.name}</h3><p className="mt-5 max-w-lg text-base leading-8 text-white/70">{feature.description}</p><ul className="mt-8 grid gap-3 text-sm text-white/80 sm:grid-cols-2">{feature.benefits.map((benefit) => <li key={benefit} className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#e2b84c]" />{benefit}</li>)}</ul><a href={feature.href} className="mt-9 inline-flex min-h-11 w-fit items-center gap-2 border-b border-[#e2b84c] pb-1 text-xs font-black uppercase tracking-[0.16em] text-white">Explore {feature.name}<ArrowUpRight className="h-4 w-4" /></a></div></div></section>;
}

export function FeatureSplit({ feature, reverse = false }: { feature: FeatureLink; reverse?: boolean }) {
  return <section className={`my-16 grid items-center gap-8 lg:grid-cols-2 ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}><div className="overflow-hidden bg-[#e8e3da]"><img src={feature.image} alt={`${feature.name} in the Allma safety system`} loading="lazy" className="aspect-[4/3] w-full object-cover" /></div><div className="py-2"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c63d3f]">Related Allma feature</p><h3 className="mt-3 font-display text-3xl font-black tracking-[-0.04em]">{feature.name}</h3><p className="mt-4 text-base leading-8 text-[#5d6057]">{feature.description}</p><a href={feature.href} className="mt-7 inline-flex min-h-11 items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#c63d3f]">Explore {feature.name} <ArrowUpRight className="h-4 w-4" /></a></div></section>;
}

export function ComparisonTable({ rows }: { rows: Array<[string, string]> }) {
  return <div className="my-12 overflow-x-auto border-y border-[#171817]/10"><table className="min-w-[580px] w-full border-collapse text-left text-sm"><thead><tr className="border-b border-[#171817]/10 text-[10px] font-black uppercase tracking-[0.16em] text-[#77796e]"><th className="px-4 py-4">Capability</th><th className="px-4 py-4">Why it matters</th></tr></thead><tbody>{rows.map(([capability, reason]) => <tr key={capability} className="border-b border-[#171817]/10 last:border-0"><th className="px-4 py-4 font-bold text-[#171817]">{capability}</th><td className="px-4 py-4 leading-6 text-[#5d6057]">{reason}</td></tr>)}</tbody></table></div>;
}

export function InsightCallout({ label, children }: { label: string; children: string }) {
  return <aside className="my-12 border-l-2 border-[#e2b84c] bg-[#fffdf9] px-6 py-5"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c63d3f]">{label}</p><p className="mt-2 text-lg font-medium leading-8 text-[#2e302b]">{children}</p></aside>;
}

export function ShareBar() {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard?.writeText(window.location.href); setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
  return <div className="flex flex-wrap items-center gap-2 border-y border-[#171817]/10 py-5"><span className="mr-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#77796e]">Share</span><button type="button" onClick={copy} className="inline-flex min-h-10 items-center gap-2 border border-[#171817]/10 px-3 text-xs font-bold text-[#5d6057] hover:text-[#c63d3f]"><Copy className="h-3.5 w-3.5" />{copied ? "Copied" : "Copy link"}</button><a aria-label="Share on WhatsApp" href="https://wa.me/" className="inline-flex h-10 w-10 items-center justify-center border border-[#171817]/10 text-[#5d6057] hover:text-[#c63d3f]"><MessageCircle className="h-4 w-4" /></a><a aria-label="Share on LinkedIn" href="https://www.linkedin.com/sharing/share-offsite/" className="inline-flex h-10 w-10 items-center justify-center border border-[#171817]/10 text-[#5d6057] hover:text-[#c63d3f]"><Linkedin className="h-4 w-4" /></a><Share2 className="ml-auto hidden h-4 w-4 text-[#77796e] sm:block" /></div>;
}

export function AuthorCard({ post }: { post: BlogPost }) {
  return <div className="flex items-center gap-4 border-t border-[#171817]/10 pt-6"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#171817] text-xs font-black text-[#e2b84c]">AS</div><div><p className="text-sm font-bold text-[#171817]">{post.author}</p><p className="mt-1 text-xs text-[#77796e]">Original Allma guide · Practical safety information from the Allma Safety AI team.</p></div></div>;
}

export function ArticleCTA({ post }: { post: BlogPost }) {
  return <section className="my-14 bg-[#c63d3f] px-6 py-8 text-white sm:px-10 sm:py-10"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f6d889]">Build a calmer safety plan</p><h2 className="mt-3 max-w-2xl font-display text-3xl font-black tracking-[-0.04em]">{post.keyword === "Allma Safety AI" ? "Prepare before the moment gets difficult." : `Make ${post.keyword.toLowerCase()} part of a practical plan.`}</h2><p className="mt-4 max-w-xl text-sm leading-7 text-white/80">{post.cta}</p><a href="/" className="mt-7 inline-flex min-h-11 items-center gap-2 bg-white px-4 text-xs font-black uppercase tracking-[0.16em] text-[#171817]">Explore Allma Safety AI <ArrowUpRight className="h-4 w-4" /></a></section>;
}
