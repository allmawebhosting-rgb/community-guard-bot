import { createFileRoute } from "@tanstack/react-router";
import { InfoPage, type InfoSection } from "@/components/allma/legal-page";

const SECTIONS: InfoSection[] = [
  {
    id: "availability",
    title: "Current availability",
    body: (
      <p>
        You can delete your account yourself in the app: open Profile, tap "Delete my account",
        confirm with your PIN or password (or a recent Google sign-in), and type DELETE. Your login,
        profile, contacts and devices are removed. Shared call history and public safety reports are
        kept without your name or phone number.
      </p>
    ),
  },
  {
    id: "data-requests",
    title: "Data requests",
    body: (
      <p>
        For other data questions, contact{" "}
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
        content: "How to delete your Allma Safety AI account and personal data.",
      },
      { property: "og:title", content: "Data & Account Deletion | Allma Safety AI" },
      {
        property: "og:description",
        content: "Delete your Allma Safety AI account and personal data from inside the app.",
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
