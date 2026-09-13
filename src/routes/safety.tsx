import { createFileRoute } from "@tanstack/react-router";
import { InfoPage, type InfoSection } from "@/components/allma/legal-page";

const SECTIONS: InfoSection[] = [
  {
    id: "call-official-services",
    title: "Always contact official emergency services first",
    body: (
      <p>
        If life, safety or property is in immediate danger, contact the official police, ambulance or
        fire service for your area straight away. Allma can help you reach people you trust and show
        you where nearby help is, but it does not dispatch official responders and cannot promise that
        anyone will arrive.
      </p>
    ),
  },
  {
    id: "what-sos-does",
    title: "What happens when you activate SOS",
    body: (
      <ul>
        <li>Allma starts an emergency record and, if you allowed it, captures your location.</li>
        <li>It contacts members of your Safety Network in the app, one after another, and retries.</li>
        <li>People who answer can see your emergency details and location according to your permissions.</li>
        <li>Nothing is sent to police, ambulance or fire services automatically.</li>
      </ul>
    ),
  },
  {
    id: "responder-safety",
    title: "If you are the person responding",
    body: (
      <ul>
        <li>Never confront an armed or violent person. Keep your distance and call official services.</li>
        <li>Only give first aid within your training.</li>
        <li>Share what you know with official responders when they arrive.</li>
        <li>You can decline any request, or turn emergency requests off at any time.</li>
      </ul>
    ),
  },
  {
    id: "ai-limits",
    title: "Limits of AI guidance",
    body: (
      <p>
        Allma's assistant gives general safety guidance. It is not medical, legal or professional
        advice, and it can be wrong or incomplete. Use your own judgement and follow the instructions
        of official responders over anything the assistant says.
      </p>
    ),
  },
  {
    id: "maps-limits",
    title: "Maps and nearby places",
    body: (
      <p>
        Hospitals, clinics, police stations and other places come from mapping data and may be
        outdated, closed or wrongly listed. Phone numbers may not be answered. Confirm before relying
        on any single listing, and tell us on the <a href="/contact">contact page</a> if something is wrong.
      </p>
    ),
  },
  {
    id: "device-requirements",
    title: "What Allma needs to work",
    body: (
      <ul>
        <li>An internet connection for chat, alerts, calls and maps.</li>
        <li>Location permission for precise SOS location and nearby help.</li>
        <li>Notification permission so emergency alerts can reach you.</li>
        <li>Microphone permission for in-app emergency calls.</li>
      </ul>
    ),
  },
];

export const Route = createFileRoute("/safety")({
  head: () => ({
    meta: [
      { title: "Emergency & Safety Notice | Allma Safety AI" },
      {
        name: "description",
        content:
          "What Allma does during an SOS, what it cannot do, and safety rules for people responding to an emergency.",
      },
      { property: "og:title", content: "Emergency & Safety Notice | Allma Safety AI" },
      {
        property: "og:description",
        content: "Always contact official emergency services first. Here is exactly what Allma does during an emergency.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://allmasafetyai.online/safety" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://allmasafetyai.online/safety" }],
  }),
  component: SafetyPage,
});

function SafetyPage() {
  return (
    <InfoPage
      eyebrow="Safety"
      title="Emergency & safety notice"
      intro="Read this before you rely on Allma in an emergency. It explains what the platform really does, and where official services must take over."
      sections={SECTIONS}
      footnote={
        <p>
          Allma is an independent platform and does not represent police, ambulance or fire services.
          In a life-threatening emergency, contact official emergency services directly.
        </p>
      }
    />
  );
}
