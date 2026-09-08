import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Safety Journal — Allma Safety AI" },
      { name: "description", content: "Practical safety guides for people, families and communities in Uganda." },
    ],
  }),
  component: () => <Outlet />,
});
