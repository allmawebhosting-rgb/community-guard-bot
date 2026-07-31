## Allma Safety AI — Phase 1

An AI-first community safety assistant. The homepage *is* the chat. Everything else (reports, SOS, lookups) happens through conversation.

### Scope for this build
AI chat + reporting core: threaded conversations saved to the cloud, conversational incident reporting, Emergency SOS, backend + auth, and the user dashboard. Admin dashboard, live maps, matching engine, and push notifications come in a later phase (schema will be laid so they slot in).

### Experience

**Homepage (`/`)** — opens straight into the assistant:
- "Hello, I'm Allma Safety AI. How can I help you today?"
- Quick-action chips: Emergency SOS, Report Crime, Missing Person, Lost & Found, Find Hospital, Find Police Station, Fire Emergency, Ambulance, Community Alerts, Ask Allma. Tapping one seeds the conversation.
- Persistent floating SOS button.

**Chat** — threaded, each thread at its own URL (`/chat/:threadId`), listed in a sidebar/drawer, messages persisted per user. Streaming responses, one question at a time, never a long form.

**Conversational reporting** — the AI drives an interview (what, when, where, description, photo, contacts) and, when it has enough, produces a structured incident report saved to the database with a reference number. Supported: crime (theft, robbery, assault, domestic violence, fraud, cybercrime, corruption, kidnapping, accident, burglary, vandalism, animal theft, other), missing persons, lost items, found items, emergencies.

**Emergency SOS** — confirm → request GPS → show emergency numbers with tap-to-call → log an emergency incident tied to the user (or anonymous).

**Missing persons** — after the interview, generate a printable poster page from the collected details and photo.

**Safety knowledge** — the assistant answers guidance questions calmly and always points to real emergency services.

**Dashboard (`/dashboard`)** — My Reports, Emergency History, Missing Persons, Lost & Found, Community Alerts, Emergency Contacts, Profile.

**Auth** — email + password, Google sign-in, and guest/anonymous reporting (a guest can still file a report; it's linked if they later sign in).

**Design** — mobile-first, dark/light mode, rounded cards, soft gradients, tasteful glass surfaces, smooth motion, high accessibility. Distinct safety-led identity (deep calm base with a decisive alert accent), not a generic AI purple theme. Custom Allma mark rather than a stock sparkle icon.

### Technical notes

- Stack stays TanStack Start + React + TypeScript + Tailwind. Backend on Lovable Cloud (Postgres, auth, storage, RLS).
- AI runs server-side through the Lovable AI Gateway with the AI SDK: a streaming chat route, tool calling for report creation/lookup, structured output for categorization, risk level, and report summaries. Keys never touch the browser.
- Chat UI built on AI Elements primitives (conversation, message, prompt input, tool display, shimmer loading).
- Tables: profiles, threads, messages, reports (with typed subtables/fields for crime, emergency, missing person, lost item, found item), evidence, community alerts, emergency contacts, notifications, report status history, user roles, audit log. Roles in a separate `user_roles` table with a security-definer check, so the admin phase drops in safely. RLS on everything: users read/write their own; alerts publicly readable.
- Media uploads (photo/video/audio) to a private storage bucket with owner-scoped policies.
- Nearby help in this phase uses a seeded facilities table + device geolocation with distance, directions link, and call button; live map layer deferred.
- Legal framing throughout: "Police Integration Ready" — explicit copy that Allma is not affiliated with any police force or emergency service, and that emergencies should also be reported by phone.
- Modular structure (chat, reporting, emergency, directory, dashboard modules) so it can fold into a larger Allma AI ecosystem later.

### Build order
1. Enable Cloud, schema + RLS + storage, auth pages.
2. Design system, shell, theming, Allma identity.
3. Chat route + streaming AI + threads/persistence.
4. Quick actions, reporting tools, report generation.
5. SOS flow, missing-person poster, nearby help, alerts.
6. Dashboard, then polish and accessibility pass.
