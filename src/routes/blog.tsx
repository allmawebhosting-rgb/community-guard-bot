import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Safety Journal | Allma Safety AI" },
      { name: "description", content: "Practical safety guides for people, families and communities in Uganda." },
      { property: "og:title", content: "Safety Journal | Allma Safety AI" },
      { property: "og:description", content: "Practical safety guides for people, families and communities in Uganda." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://allmasafetyai.online/blog" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Safety Journal | Allma Safety AI" },
      { name: "twitter:description", content: "Practical safety guides for people, families and communities in Uganda." },
    ],
    links: [{ rel: "canonical", href: "https://allmasafetyai.online/blog" }],
  }),
  component: () => <Outlet />,
});
