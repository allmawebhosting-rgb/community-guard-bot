import { createFileRoute } from "@tanstack/react-router";
import { InfoPage, type InfoSection } from "@/components/allma/legal-page";

const UPDATED = "13 September 2026";

const SECTIONS: InfoSection[] = [
  {
    id: "what-allma-is",
    title: "What Allma is — and is not",
    body: (
      <>
        <p>
          Allma Safety AI is an independent safety platform. It helps you prepare for emergencies,
          alert people you trust, get AI guidance and find real help nearby.
        </p>
        <p>
          Allma is <strong>not</strong> an official emergency service and does not replace police,
          ambulance or fire services. Allma cannot guarantee that anyone will answer, accept or arrive.
        </p>
      </>
    ),
  },
  {
    id: "your-account",
    title: "Your account",
    body: (
      <ul>
        <li>Give accurate details — emergency features depend on them.</li>
        <li>Keep your sign-in secure and don't let anyone else use your account.</li>
        <li>You must be 18 or older, or use the account under a parent or guardian.</li>
      </ul>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>Raise false alarms, test SOS on real contacts without telling them, or misuse emergency calling.</li>
          <li>Post false, harassing or unlawful reports, or claim someone else's lost item.</li>
          <li>Claim official qualifications, ranks or affiliations you do not hold.</li>
          <li>Try to access other people's data, locations or Safety Networks.</li>
          <li>Interfere with, scrape or overload the service.</li>
        </ul>
        <p>We may suspend or remove accounts that misuse the emergency features.</p>
      </>
    ),
  },
  {
    id: "content",
    title: "Content you post",
    body: (
      <p>
        You keep ownership of what you post, and you give Allma permission to display it where you
        chose to publish it — for example community alerts or the public Lost &amp; Found. You are
        responsible for having the right to share any photo or detail you upload. We may remove
        content that breaks these terms.
      </p>
    ),
  },
  {
    id: "safety-rules",
    title: "Safety rules override preferences",
    body: (
      <p>
        You can configure who Allma should contact for different situations, but Allma still applies
        safety rules. For violent or armed emergencies, Allma prioritises official emergency services
        and will not encourage anyone to confront a suspect.
      </p>
    ),
  },
  {
    id: "availability",
    title: "Availability",
    body: (
      <p>
        Allma depends on your internet connection, your device permissions, mobile networks and
        third-party services. Features may be interrupted, delayed or unavailable. We provide the
        service "as is" and do not guarantee uninterrupted operation.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limits of liability",
    body: (
      <p>
        To the extent permitted by law, Allma is not liable for indirect or consequential loss, or for
        harm arising from a delayed, failed or unanswered alert, an inaccurate map or listing, or the
        actions of other users or responders. Nothing here limits liability that cannot be limited by
        law.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes and ending use",
    body: (
      <p>
        You can stop using Allma and delete your account at any time on our{" "}
        <a href="/data-requests">data and deletion page</a>. We may update these terms and will notify
        you in the app when the change is significant.
      </p>
    ),
  },
];

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service | Allma Safety AI" },
      {
        name: "description",
        content:
          "The rules for using Allma Safety AI, including acceptable use, safety limits, availability and liability.",
      },
      { property: "og:title", content: "Terms of Service | Allma Safety AI" },
      {
        property: "og:description",
        content: "Allma is an independent safety platform, not an official emergency service. Here are the terms of use.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://allmasafetyai.online/terms" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://allmasafetyai.online/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title="Terms of service"
      intro="Plain rules for using Allma, written so you know exactly what the platform does and does not promise."
      updated={UPDATED}
      sections={SECTIONS}
    />
  );
}
