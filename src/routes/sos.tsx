import { createFileRoute } from "@tanstack/react-router";
import { SOSExperience } from "@/components/allma/sos-experience";

export const Route = createFileRoute("/sos")({
  validateSearch: (search: Record<string, unknown>): { instant?: true; check?: string } => {
    const instant =
      search.instant === true ||
      search.instant === "true" ||
      search.instant === 1 ||
      search.instant === "1";
    const check = typeof search.check === "string" && search.check ? search.check : undefined;
    return { ...(instant ? { instant: true as const } : {}), ...(check ? { check } : {}) };
  },



  head: () => ({
    meta: [
      { title: "Emergency SOS — Allma Safety AI" },
      {
        name: "description",
        content:
          "Activate emergency SOS. Allma captures your location, guides you through an incident report and connects you with the nearest responders.",
      },
      { property: "og:title", content: "Emergency SOS — Allma Safety AI" },
      {
        property: "og:description",
        content:
          "AI-guided emergency response. Share your location and get help immediately.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SOSRoute,
});

function SOSRoute() {
  const { instant, check } = Route.useSearch();
  return <SOSExperience instant={instant} smartCheckId={check} />;
}
