import { createFileRoute } from "@tanstack/react-router";
import { InfoPage, type InfoSection } from "@/components/allma/legal-page";

const SECTIONS: InfoSection[] = [
  {
    id: "mission",
    title: "Why Allma exists",
    body: (
      <p>
        In an emergency, the hardest part is often the first two minutes: knowing what to do, who to
        tell and where the nearest help is. Allma was built to remove that hesitation — a calm
        assistant that helps you prepare in advance and acts fast when something goes wrong.
      </p>
    ),
  },
  {
    id: "safety-network",
    title: "Your Safety Network",
    body: (
      <p>
        Everyone on Allma builds a small circle of trusted people. They only join after accepting your
        invitation, you decide the order they are contacted, and you set what each of them may see.
        Phone numbers are never shown — contact happens inside the app.
      </p>
    ),
  },
  {
    id: "sos",
    title: "SOS and emergency calling",
    body: (
      <p>
        When you activate SOS, Allma opens an emergency record, captures your location if you allowed
        it, and calls your Safety Network in the app one after another until someone answers. The
        person who answers sees your emergency details and a live map, according to your permissions.
      </p>
    ),
  },
  {
    id: "nearby",
    title: "Real help nearby",
    body: (
      <p>
        Allma shows real hospitals, clinics, police stations and other help around you with addresses,
        distances, phone numbers and directions — for you and for whoever is coming to help.
      </p>
    ),
  },
  {
    id: "community",
    title: "Community alerts and Lost & Found",
    body: (
      <p>
        Beyond personal emergencies, Allma lets communities share verified-by-people alerts and post
        lost or found items and people, with identifying details masked until a claim is reviewed.
      </p>
    ),
  },
  {
    id: "honesty",
    title: "Our honesty rule",
    body: (
      <p>
        Allma never pretends. If no one has answered, we say so. If official services have not been
        contacted, we do not claim they have. Every status you see comes from something that really
        happened.
      </p>
    ),
  },
];

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Allma Safety AI" },
      {
        name: "description",
        content:
          "Allma Safety AI helps people prepare for emergencies, alert a trusted Safety Network and find real help nearby — built for communities in Uganda.",
      },
      { property: "og:title", content: "About Allma Safety AI" },
      {
        property: "og:description",
        content: "How Allma's Safety Network, SOS calling, nearby help and community reporting fit together.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://allmasafetyai.online/about" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://allmasafetyai.online/about" }],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <InfoPage
      eyebrow="About"
      title="Safety that acts in the first two minutes"
      intro="Allma Safety AI is an independent safety platform for people, families and communities — calm guidance, a trusted circle, and real help nearby."
      sections={SECTIONS}
    />
  );
}
