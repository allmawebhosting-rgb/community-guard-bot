# Redesign: Allma Safety AI (mockup-matched)

Rebuild the whole front end to match the uploaded mockup — a dark, mobile-first Uganda safety assistant with a red/gold signal palette, glowing robot mascot, bottom tab bar with a central SOS, and the five AI experiences shown in the mockup panels. All existing backend tables (reports, evidence, alerts, facilities, threads, messages, contacts) and the AI chat route stay in place.

## 1. Visual system (replaces the current blue palette)

- New dark-first tokens in `src/styles.css`: near-black background (`#0a0a0a`-class), elevated card surface, **crimson red primary** with glow, **gold/amber accent**, plus per-category tints (theft, missing, lost, hospital, police, fire) and severity colors (critical / high / low) for alerts.
- Add tokens for the mockup's signature effects: radial red mascot halo, flowing red-gold light streak background, gold gradient text, card glow-on-hover, SOS pulse ring.
- Typography: bold display headings + clean sans body (Space Grotesk / DM Sans already loaded), with gold-highlighted words in headlines ("Uganda's **AI** Safety Assistant").
- Every color stays a semantic token; no hardcoded hex in components. Light mode kept readable but the app is designed dark.

## 2. Marketing landing page (`/`)

Mirrors the top of the mockup: logo lockup, "Uganda's AI Safety Assistant / Report. Get Help. Stay Safe." headline over the light-streak background, product description, phone-frame previews of the assistant and SOS screens, and the 5-badge feature strip (AI-First, Step by Step, Smart Suggestions, Media Support, Built for Uganda). CTA into the app / sign-in. Own SEO head tags.

## 3. App shell

- Replace the sidebar-heavy shell with a **mobile-app layout**: compact top bar (menu, agent avatar + "Online" status, profile mark) and a **bottom tab bar** — Home, Alerts, centre floating SOS, Reports, Profile.
- On desktop the same layout is centred in a max-width column with an optional slide-over drawer for chat threads, so it reads as one product on both sizes.

## 4. Home / assistant screen

Glowing robot mascot with red halo, "Hello 👋 I'm **Allma Safety AI** — How can I help keep you safe today?", then the 2×3 tinted action grid: Emergency SOS, Report Crime, Missing Person, Lost & Found, Find Hospital, Police Station. Each tile seeds the matching AI flow.

## 5. Emergency SOS screen

Hold-to-activate ring (3-second press with progress ring and haptic-style pulse), then Share Location / Call Police / Call Ambulance action tiles and an "Emergency Contacts — N will be notified" row that reads the existing contacts table.

## 6. The five AI features from the mockup

1. **AI chat assistant** — restyled transcript: assistant messages on the surface with the agent avatar and timestamps, user messages in a red-tinted bubble with a read tick, typing indicator, and a composer with mic + attach.
2. **Step-by-step guided reporting** — the AI drives one question at a time; the UI renders a "Step 2 of 7" progress bar, a question card, tappable option list with a green check on the selected answer (Just now / Within 1 hour / Earlier today / Yesterday / Custom time incl. date picker), and a helper footnote. Implemented as an AI tool the model calls to ask a structured question; answers post back as the next user turn.
3. **Media upload** — "Do you have a photo of the phone?" card with photo preview, Change Photo / Continue / Skip for now. Camera capture and gallery pick upload to the existing private `evidence` bucket; signed URLs are attached to the message so the model can see the image.
4. **Smart suggestions** — "Recommended Actions" card the AI emits per report type (Block SIM Card, Block Mobile Money, Track IMEI, Call Police, Generate Report, See All Actions), each with icon, subtitle, and a tap action.
5. **Report summary** — review card with Category / Item / Date / Location / IMEI / Photos rows, Edit and gold "Confirm & Submit" buttons, "you will receive a report number" note and a "Your data is secure" footer. Confirm writes the report and returns its reference number.

## 7. Supporting screens

- **Nearby Help** — facility list (police, hospital, medical centre, fire) with distance, call and directions buttons, beside a map panel with colour-coded markers and "View all on map".
- **Community Alerts** — severity-badged alert cards (CRITICAL / HIGH / LOW) with relative timestamps.
- **My Reports** — report cards with reference number and status chip (Under Review, Received, In Progress).
- **Quick Ask AI** — tappable starter questions ("What should I do during a flood?", "How do I report cyber crime?", "What numbers should I call in emergency?", "How do I stay safe at night?") plus a slim "Ask Allma AI…" input.

## Technical notes

- No schema changes needed; all screens read/write existing tables under current RLS. Nearby-help distance is computed client-side from facility coordinates.
- Chat stays on `src/routes/api/chat.ts` with the current model and persistence; new features are added as AI SDK tools (`ask_structured_question`, `request_media`, `recommend_actions`, `report_summary`) rendered as custom tool cards in the transcript, with tool params collapsed by default.
- Voice input keeps the existing `/api/transcribe` route; camera/gallery upload reuses the `evidence` bucket with signed URLs.
- The safety disclaimer ("not officially connected to police") stays visible on SOS and report submission.
- Large components are split per screen under `src/components/allma/` so no file grows unwieldy; `allma-chat.tsx` is broken into transcript, composer, and tool-card modules.
- The mockup image is design reference only and is not embedded in the app; the robot mascot and light-streak artwork are generated as app assets.
