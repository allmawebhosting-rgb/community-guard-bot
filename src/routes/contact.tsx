import { createFileRoute } from "@tanstack/react-router";
import { InfoPage, type InfoSection } from "@/components/allma/legal-page";

const SECTIONS: InfoSection[] = [
  {
    id: "not-for-emergencies",
    title: "This page is not for emergencies",
    body: (
      <p>
        Support messages are read during working hours only. If you are in danger right now, contact
        official emergency services, and use SOS in the app to alert your Safety Network.
      </p>
    ),
  },
  {
    id: "support",
    title: "General support",
    body: (
      <p>
        Email <a href="mailto:allmawebhosting@gmail.com">allmawebhosting@gmail.com</a> with what
        happened, the page or feature involved, and the device you used. We usually reply within two
        working days.
      </p>
    ),
  },
  {
    id: "report-abuse",
    title: "Report abuse or a false report",
    body: (
      <p>
        Tell us the post or account involved and why it is a problem. We remove content that breaks our{" "}
        <a href="/terms">terms</a>, and we act faster on anything that puts someone at risk.
      </p>
    ),
  },
  {
    id: "wrong-listing",
    title: "A hospital or police station is wrong",
    body: (
      <p>
        Send us the name, the area and what is wrong — closed, moved, or a number that does not work.
        Listings come from mapping data, so corrections help everyone nearby.
      </p>
    ),
  },
  {
    id: "privacy-and-data",
    title: "Privacy and data requests",
    body: (
      <p>
        For a copy of your data or account deletion, follow the steps on our{" "}
        <a href="/data-requests">data and deletion page</a>.
      </p>
    ),
  },
  {
    id: "partnerships",
    title: "Responders and partnerships",
    body: (
      <p>
        If you represent a clinic, response team or local authority and want to be reachable through
        Allma, email us with your organisation and area. Verification is required before any official
        capability is shown in the app.
      </p>
    ),
  },
];

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact & Support | Allma Safety AI" },
      {
        name: "description",
        content:
          "How to reach Allma Safety AI support, report abuse, correct a wrong hospital or police listing, or ask a privacy question.",
      },
      { property: "og:title", content: "Contact & Support | Allma Safety AI" },
      {
        property: "og:description",
        content: "Support, abuse reports, listing corrections and privacy requests for Allma Safety AI.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://allmasafetyai.online/contact" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://allmasafetyai.online/contact" }],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <InfoPage
      eyebrow="Support"
      title="Contact & support"
      intro="Questions, corrections and reports are welcome. For anything happening right now, use SOS and official emergency services instead."
      sections={SECTIONS}
    />
  );
}
