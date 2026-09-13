# Missing public pages (legal, trust and support)

The app currently has no privacy, terms or support pages, and nothing links to them. This adds the missing standalone pages plus a shared footer so people can reach them.

## New pages

1. **Privacy Policy** (`/privacy`) — what Allma collects (name, phone, email, photo, location during SOS, emergency messages and calls), why, who can see it, how location sharing works, retention, and how to request deletion.
2. **Terms of Service** (`/terms`) — acceptable use, that Allma is an independent platform and not an official emergency service, no guarantee that help arrives, account rules, liability limits.
3. **Emergency & Safety Disclaimer** (`/safety`) — plain warning to always contact official emergency services, no confronting suspects, how the Safety Network calling works.
4. **Cookies & Storage** (`/cookies`) — session storage, notification permissions, no advertising tracking.
5. **About Allma** (`/about`) — mission, how the safety network, SOS, community reports and Lost & Found fit together.
6. **Contact & Support** (`/contact`) — support email, response expectations, how to report abuse or a wrong listing, plus a note that this page is not for emergencies.
7. **Help / FAQ** (`/help`) — questions on setting up a Safety Network, what happens when SOS is pressed, notifications on phones, privacy of location, Lost & Found claims.
8. **Data & Account Deletion** (`/data-requests`) — how to request an export or deletion and what gets removed.

Contact details are placeholders until you give me the real support email and phone; I will mark them clearly so you can confirm.

## Navigation

- A shared site footer rendered on public pages, grouped as Product / Safety / Legal, with the Allma mark and the "independent platform" line.
- Footer links added into the existing app shell so signed-in users can reach the same pages.
- Each page gets its own title, description and social preview text; no fake certifications, partnerships or statistics anywhere.

## Technical notes

- New route files under `src/routes/`: `privacy.tsx`, `terms.tsx`, `safety.tsx`, `cookies.tsx`, `about.tsx`, `contact.tsx`, `help.tsx`, `data-requests.tsx`, each with `createFileRoute` matching its filename and its own `head()` meta (title, description, og:title, og:description, og:type, twitter:card).
- A shared `src/components/allma/legal-page.tsx` wrapper (hero, prose sections, last-updated line) plus `src/components/allma/site-footer.tsx`, both using existing design tokens — no new colors or hardcoded color utilities.
- Content is static presentation only: no database tables, no server functions, no changes to SOS, calling, auth, routing guards or existing pages beyond adding footer links.
- Verify with a typecheck and a load of each new route at desktop and phone widths.
