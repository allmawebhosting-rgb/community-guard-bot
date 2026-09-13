import { createFileRoute } from "@tanstack/react-router";
import { InfoPage, type InfoSection } from "@/components/allma/legal-page";

const SECTIONS: InfoSection[] = [
  {
    id: "what-we-store",
    title: "What we store on your device",
    body: (
      <ul>
        <li><strong>Sign-in session</strong> — so you stay signed in and emergency features keep working.</li>
        <li><strong>Preferences</strong> — light or dark appearance, and settings you choose in the app.</li>
        <li><strong>Onboarding progress</strong> — so you can resume where you stopped.</li>
        <li><strong>Notification registration</strong> — if you allow alerts, so emergency notifications can reach this device.</li>
      </ul>
    ),
  },
  {
    id: "no-advertising",
    title: "No advertising trackers",
    body: (
      <p>
        Allma does not use advertising cookies and does not sell your data or build advertising
        profiles. We do not embed third-party ad networks.
      </p>
    ),
  },
  {
    id: "third-parties",
    title: "Third-party services",
    body: (
      <p>
        Maps, in-app calling, notifications and hosting are provided by service providers. Their
        scripts may set their own technical storage needed to display a map or connect a call. They
        process this only to deliver the feature.
      </p>
    ),
  },
  {
    id: "your-control",
    title: "Your control",
    body: (
      <ul>
        <li>Clear your browser storage to sign out and remove preferences.</li>
        <li>Turn notifications off in your browser or device settings at any time.</li>
        <li>Blocking essential storage will sign you out and break emergency features.</li>
      </ul>
    ),
  },
];

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookies & Storage | Allma Safety AI" },
      {
        name: "description",
        content:
          "What Allma Safety AI stores on your device: sign-in session, preferences, onboarding progress and notification registration. No advertising trackers.",
      },
      { property: "og:title", content: "Cookies & Storage | Allma Safety AI" },
      {
        property: "og:description",
        content: "Allma stores only what it needs to keep you signed in and reachable during an emergency.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://allmasafetyai.online/cookies" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://allmasafetyai.online/cookies" }],
  }),
  component: CookiesPage,
});

function CookiesPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title="Cookies & storage"
      intro="Allma keeps device storage to the minimum needed to keep you signed in, remember your settings and reach you with emergency alerts."
      sections={SECTIONS}
    />
  );
}
