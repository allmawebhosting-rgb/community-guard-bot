import { createFileRoute } from "@tanstack/react-router";
import { InfoPage, type InfoSection } from "@/components/allma/legal-page";

const UPDATED = "13 September 2026";

const SECTIONS: InfoSection[] = [
  {
    id: "what-we-collect",
    title: "Information we collect",
    body: (
      <>
        <p>We only collect what Allma needs to help you in an emergency:</p>
        <ul>
          <li><strong>Account details</strong> — your name, email address, phone number and optional profile photo.</li>
          <li><strong>Safety Network</strong> — the people you invite, their relationship to you, priority order and the permissions you set for them.</li>
          <li><strong>Location</strong> — your device location when you activate SOS, ask for nearby help, or explicitly share it. Allma does not track you in the background.</li>
          <li><strong>Emergency activity</strong> — SOS activations, emergency chat messages, call attempts and their outcomes, and reports you file.</li>
          <li><strong>Reports you publish</strong> — community alerts and Lost &amp; Found posts, including any photos you upload.</li>
          <li><strong>Technical data</strong> — basic device and error information needed to keep the app working.</li>
        </ul>
      </>
    ),
  },
  {
    id: "why",
    title: "Why we use it",
    body: (
      <ul>
        <li>To alert the people you chose when you activate SOS, and to connect in-app calls between you.</li>
        <li>To show you real hospitals, clinics, police stations and other help near your location.</li>
        <li>To give you AI safety guidance and keep a record of your own reports.</li>
        <li>To keep accounts secure and prevent abuse of the emergency features.</li>
      </ul>
    ),
  },
  {
    id: "location",
    title: "How location sharing works",
    body: (
      <>
        <p>
          Location is never continuously shared with other users by default. During an active SOS,
          your location can be shared with people in your Safety Network according to the permissions
          you set — approximate before someone accepts, more precise after they accept.
        </p>
        <p>
          People who opt in as nearby responders are shown only a display name and an approximate
          distance. Exact coordinates of other users are never shown to you, and yours are never
          shown to strangers.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who can see your information",
    body: (
      <ul>
        <li><strong>People you chose.</strong> Only members of your Safety Network are contacted during an SOS, and only with the permissions you granted.</li>
        <li><strong>Nobody by default.</strong> Your phone number and email are never shown to other users. In-app calling never reveals phone numbers.</li>
        <li><strong>Service providers.</strong> We use hosting, database, maps, calling and notification providers to run the app. They process data on our behalf only.</li>
        <li><strong>Authorities.</strong> We share information with authorities only where we are legally required to, or where you have asked us to help pass on a report.</li>
      </ul>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <p>
        Account and Safety Network data is kept while your account is active. Emergency records and
        reports are kept so you and the people involved can review what happened. Temporary
        location fixes and responder presence entries expire shortly after they are created. When you
        delete your account, we remove your personal data except where we must keep records by law.
      </p>
    ),
  },
  {
    id: "your-rights",
    title: "Your choices and rights",
    body: (
      <ul>
        <li>Turn location off, or continue without it — SOS still works, but with less precision.</li>
        <li>Turn emergency calls or notifications off at any time in your settings.</li>
        <li>Remove, disable or reorder anyone in your Safety Network.</li>
        <li>Ask for a copy of your data, or ask us to delete your account, on our <a href="/data-requests">data and deletion page</a>.</li>
      </ul>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        Allma is intended for adults. A parent or guardian should set up and manage the account for
        anyone under 18, including their Safety Network and permissions.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Questions about privacy",
    body: (
      <p>
        Write to us at <a href="mailto:allmawebhosting@gmail.com">allmawebhosting@gmail.com</a> or use
        the <a href="/contact">contact page</a>. We will reply to privacy requests as quickly as we can.
      </p>
    ),
  },
];

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | Allma Safety AI" },
      {
        name: "description",
        content:
          "How Allma Safety AI collects, uses and protects your account details, Safety Network, emergency records and location data.",
      },
      { property: "og:title", content: "Privacy Policy | Allma Safety AI" },
      {
        property: "og:description",
        content: "What Allma collects, why, who can see it, and how location sharing works during an SOS.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://allmasafetyai.online/privacy" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://allmasafetyai.online/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title="Privacy policy"
      intro="Allma handles emergency information, so we keep collection minimal, sharing deliberate and control in your hands."
      updated={UPDATED}
      sections={SECTIONS}
      footnote={
        <p>
          If we change this policy in a way that affects how your emergency data is used, we will
          tell you in the app before the change takes effect.
        </p>
      }
    />
  );
}
