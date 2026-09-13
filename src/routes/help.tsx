import { createFileRoute } from "@tanstack/react-router";
import { InfoPage, type InfoSection } from "@/components/allma/legal-page";

const SECTIONS: InfoSection[] = [
  {
    id: "safety-network",
    title: "How do I set up my Safety Network?",
    body: (
      <p>
        Open your profile and add trusted people by their Allma account or verified phone number. They
        each receive an invitation and only join once they accept. You can then set their relationship,
        priority order and what they may see during an emergency.
      </p>
    ),
  },
  {
    id: "sos",
    title: "What happens when I press SOS?",
    body: (
      <ul>
        <li>Allma opens an emergency record and captures your location if you allowed it.</li>
        <li>Your Safety Network is called in the app, one after another, with retries.</li>
        <li>Whoever answers sees your emergency details, live location and nearby help.</li>
        <li>Official services are not contacted automatically — call them yourself.</li>
      </ul>
    ),
  },
  {
    id: "notifications",
    title: "Why am I not getting alerts on my phone?",
    body: (
      <ul>
        <li>Allow notifications when the app asks, and check they are not blocked in device settings.</li>
        <li>On iPhone, add Allma to your home screen first — notifications only work for the installed app.</li>
        <li>Keep battery saver and Do Not Disturb from silencing the app.</li>
      </ul>
    ),
  },
  {
    id: "calls",
    title: "A call didn't connect. What now?",
    body: (
      <ul>
        <li>Allow microphone access when prompted — a call cannot connect without it.</li>
        <li>Weak or restricted mobile networks can block the connection; try Wi-Fi if you can.</li>
        <li>Allma keeps trying the next person in your network, so wait for the next ring.</li>
      </ul>
    ),
  },
  {
    id: "location",
    title: "Who can see my location?",
    body: (
      <p>
        Nobody, by default. During an SOS your location is shared only with the people you chose, and
        only at the level you allowed. Other users are never shown your exact coordinates outside an
        emergency you started. Details are on the <a href="/privacy">privacy page</a>.
      </p>
    ),
  },
  {
    id: "lost-found",
    title: "How do Lost & Found claims work?",
    body: (
      <p>
        Posts hide identifying details until a claim is reviewed. If you believe an item is yours,
        submit a claim describing details only the owner would know. The person who posted it decides.
      </p>
    ),
  },
  {
    id: "no-location",
    title: "Can I use Allma without location?",
    body: (
      <p>
        Yes. Chat, alerts, reports and calling still work. Without location, SOS cannot show where you
        are and nearby help will be less accurate, so we strongly recommend allowing it.
      </p>
    ),
  },
  {
    id: "delete",
    title: "How do I delete my account?",
    body: (
      <p>
        Follow the steps on our <a href="/data-requests">data and account deletion page</a>.
      </p>
    ),
  },
];

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help & FAQ | Allma Safety AI" },
      {
        name: "description",
        content:
          "Answers about setting up your Safety Network, what happens during SOS, phone notifications, emergency calls, location privacy and Lost & Found claims.",
      },
      { property: "og:title", content: "Help & FAQ | Allma Safety AI" },
      {
        property: "og:description",
        content: "Practical answers to the most common questions about using Allma Safety AI.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://allmasafetyai.online/help" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://allmasafetyai.online/help" }],
  }),
  component: HelpPage,
});

function HelpPage() {
  return (
    <InfoPage
      eyebrow="Support"
      title="Help & frequently asked questions"
      intro="Short answers to what people ask most — setting up your circle, what SOS really does, notifications, calls and privacy."
      sections={SECTIONS}
      footnote={
        <p>
          Still stuck? Reach us on the <a className="font-medium text-primary underline" href="/contact">contact page</a>.
        </p>
      }
    />
  );
}
