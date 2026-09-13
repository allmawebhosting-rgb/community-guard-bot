import { createFileRoute } from "@tanstack/react-router";
import { InfoPage, type InfoSection } from "@/components/allma/legal-page";

const SECTIONS: InfoSection[] = [
  {
    id: "request",
    title: "How to make a request",
    body: (
      <p>
        Email <a href="mailto:allmawebhosting@gmail.com">allmawebhosting@gmail.com</a> from the address
        on your Allma account and tell us whether you want a copy of your data, a correction, or full
        deletion. We may ask you to confirm it is really you before we act.
      </p>
    ),
  },
  {
    id: "export",
    title: "Getting a copy of your data",
    body: (
      <p>
        We send a file containing your profile, Safety Network connections, preferences, your own
        reports and your emergency history. We do not include other people's private information.
      </p>
    ),
  },
  {
    id: "deletion",
    title: "What deletion removes",
    body: (
      <ul>
        <li>Your profile, photo, phone number and email.</li>
        <li>Your Safety Network connections and invitations, in both directions.</li>
        <li>Your preferences, permissions and notification registrations.</li>
        <li>Your chats with the assistant and your saved location settings.</li>
      </ul>
    ),
  },
  {
    id: "what-stays",
    title: "What may remain",
    body: (
      <ul>
        <li>Emergency records shared with other people may be kept in a de-identified form so their own history stays intact.</li>
        <li>Content you published publicly may remain if others rely on it, unless you ask us to remove it too.</li>
        <li>Records we are required to keep by law.</li>
      </ul>
    ),
  },
  {
    id: "timing",
    title: "How long it takes",
    body: (
      <p>
        We aim to confirm within two working days and complete the request within 30 days. Deletion is
        permanent and cannot be undone, so you will need a new account to use Allma again.
      </p>
    ),
  },
  {
    id: "before-you-delete",
    title: "Before you delete",
    body: (
      <p>
        Deleting your account removes you from other people's Safety Networks, so they can no longer
        reach you through Allma in an emergency. If you only want a break, turn availability and
        emergency calls off in your settings instead.
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
        content:
          "How to request a copy of your Allma Safety AI data, correct it, or permanently delete your account and what that removes.",
      },
      { property: "og:title", content: "Data & Account Deletion | Allma Safety AI" },
      {
        property: "og:description",
        content: "Request an export, a correction or full deletion of your Allma Safety AI account.",
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
      intro="You can ask for a copy of everything Allma holds about you, correct it, or have your account removed for good."
      sections={SECTIONS}
    />
  );
}
