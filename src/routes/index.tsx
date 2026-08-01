import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/allma/landing-page";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Allma Safety AI — Uganda's AI safety assistant" },
      {
        name: "description",
        content:
          "Chat with Allma Safety AI to report crime, raise an SOS, find hospitals and police stations, and get calm safety guidance in seconds. Built for Uganda.",
      },
      { property: "og:title", content: "Allma Safety AI — Uganda's AI safety assistant" },
      {
        property: "og:description",
        content: "Report incidents by chatting. Emergency SOS, crime reports, missing persons, lost & found and nearby help.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});
