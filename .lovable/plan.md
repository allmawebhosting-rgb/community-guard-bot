# Pitch Deck v4 — Real App Screenshots + Full Feature Detail

Replace the generated stock-style photography with actual screenshots captured from the running Allma Safety AI app, and expand each slide into a detailed feature walkthrough.

## What changes

1. **Capture real screens** by driving the live app in a headless browser at desktop and mobile sizes, signed in as a real test account so authenticated screens render with real data:
   - Landing / Allma chat (guest)
   - Auth + onboarding
   - Allma AI chat with a guided flow, suggestions and a facility result card
   - Dashboard
   - SOS activation screen, live escalation with Safety Network list, report screen, submitted screen
   - Safety Network panel + connection requests + notifications bell
   - Calls screen (in-app calling, relay status)
   - Lost & Found public page, item detail sheet, post-a-lost-item form
   - Nearby services, Alerts, Health reminders, Profile (privacy center, relay health)
   - Police command center: overview, incidents, dispatch, map, case detail, AI, analytics

2. **Rebuild the deck as v4** (`allma-safety-ai-pitch_v4.pdf`), keeping the Uganda Night visual system but with each feature slide built around its real screenshot in a device frame, plus:
   - What the feature does, in plain language
   - How it works technically (one line)
   - What is real today vs. what is not claimed (keeps the honesty boundary the product already enforces)
   - Key numbers or states visible in the shot

3. **Slide set** grows to roughly 16–18 slides so every feature gets its own detail page instead of being grouped.

4. **QA**: render every page to an image and inspect all of them for clipped text, unreadable screenshots, misaligned frames, and empty space; fix and re-render until clean.

## Technical notes

- Screenshots come from Playwright against `http://localhost:8080` with a fixed viewport; mobile shots use a phone-sized viewport for SOS and chat.
- Authenticated routes need a preview session; it will be minted for a non-privileged existing account. Screens with no seeded data will be shown in their real empty state rather than faked with invented rows.
- The deck is assembled with the existing ReportLab script (`/tmp/deck/build.py`), extended with a screenshot-frame layout block.
- Output goes to `/mnt/documents/allma-safety-ai-pitch_v4.pdf`; v3 stays untouched.

## Not included

- No app code changes; this is a documentation deliverable only.
- No invented metrics, no mock incident data added to the database for the sake of nicer screenshots.
