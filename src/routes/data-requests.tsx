import { createFileRoute } from "@tanstack/react-router";
import { InfoPage, type InfoSection } from "@/components/allma/legal-page";

const SECTIONS: InfoSection[] = [
  {
    id: "availability",
    title: "Current availability",
    body: (
      <p>
        Account deletion is not currently available in the app, and we are not yet able to fulfill
        deletion requests by email. Please do not submit a request expecting it to be completed. We
        will update this page when a tested request process is available.
      </p>
    ),
  },
  {
    id: "data-requests",
    title: "Data requests",
    body: (
      <p>
        There is no self-service data-request form. Account-deletion requests are not currently
        processed by email. For general questions only, contact{" "}
        <a href="mailto:allmawebhosting@gmail.com">allmawebhosting@gmail.com</a>.
      </p>
    ),
  },
  {
    id: "while-unavailable",
    title: "If you no longer want to use Allma",
    body: (
      <p>
        You can sign out, turn off availability and emergency calls in settings, and stop using the
        app. These actions do not delete your account or its associated data.
      </p>
    ),
  },
];

export const Route = createFileRoute("/data-requests")({
  head: () => ({
    meta: [
      { title: "Data & Account Deletion | Allma Safety AI" },
      {
        name: "description",
        content: "Current availability of Allma Safety AI data requests and account deletion.",
      },
      { property: "og:title", content: "Data & Account Deletion | Allma Safety AI" },
      {
        property: "og:description",
        content: "Account deletion and data-request fulfillment are not currently available.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://allmasafetyai.online/data-requests" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://allmasafetyai.online/data-requests" }],
  }),
  component: DataRequestsPage,
});

function DataRequestsPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title="Data & account deletion"
      intro="Account deletion is not currently available in the app, and requests sent by email cannot yet be processed. This page will be updated when a tested process is available."
      sections={SECTIONS}
    />
  );
}
