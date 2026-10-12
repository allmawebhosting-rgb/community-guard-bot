# Allma Voice: full voice onboarding + "do anything" control

## What the user gets
1. **Voice onboarding, start to finish.** After choosing "Use voice", Allma walks a new person through every setup step out loud, asks one question at a time, listens, confirms, and moves on:
   - Welcome → "What's your name?" → phone (optional) → "Can I use your location?" (triggers the real permission prompt) → trusted contacts ("Who should I call in an emergency? Their name and number?" — repeats for more, "that's all" to stop) → safety plan / location sharing preference → health reminders yes/no → summary read back → "Shall I finish?" → saves and opens the home screen.
   - Each answer is read back ("I heard Sarah Nakato, is that right?"). "No", "go back", "skip" all work. The on-screen setup page moves in step with the voice, so what she says matches what's shown.
   - Progress saves after every step exactly like the typed setup, so leaving halfway resumes at the same step.
2. **Allma can perform real tasks by voice**, not just open pages:
   - File a report (theft, missing person, lost & found) by asking the needed questions, then submitting and reading back the real reference number.
   - Add a trusted contact / send a Safety Network request.
   - Find nearest police / hospital / clinic and read the real top results with distance; "call it" opens the place's call button.
   - Start SOS, open any page, go back, read recent alerts, read my reports and their status, set a health reminder, switch to text mode.
   - Before anything that saves or sends, Allma asks "Shall I go ahead?" and only acts on a yes. It always says what really happened (real reference, or the real error) — never pretends.
3. Anything it genuinely can't do, it says so and offers to open the right page.

## Technical details
- `src/routes/api/voice-assistant.ts`: switch from tag-parsing to AI SDK tools on the Responses endpoint (`openai/gpt-6-astra`, streamed, store:false), multi-step with `stopWhen`. Server tools run as the signed-in user (bearer token forwarded, RLS applies): `save_onboarding_step`, `add_emergency_contact`, `finish_onboarding`, `create_report`, `find_facilities` (reuses the chat's area resolver), `list_my_reports`, `list_alerts`, `send_network_request`, `create_health_reminder`. Client-only actions (navigate, back, SOS, request location permission, exit) returned as structured actions the client executes.
- Mutating tools require a confirmed flag the model only sets after the user's spoken yes (enforced in the prompt and by a pending-confirmation echo).
- New onboarding mode in the system prompt, driven by the user's current saved `onboarding_step`, so the server — not the model — decides the step; can't skip or loop.
- `onboarding.tsx`: listen for a voice "step changed / draft updated" event so the visible page mirrors the voice flow; reuse its existing save logic (profiles upsert, emergency_contacts insert).
- `voice-assistant.tsx`: auto-enter onboarding script when signed in and onboarding is incomplete; render the current question + answer chips on the takeover screen; signed-out users are asked to sign in by voice first and taken to /auth.
- No database changes. Never shows phone numbers of other members; SOS and police screens still pause voice.
- Verify: live voice-flow test via typed transcripts against the route as a test account — full onboarding, a theft report with real reference, nearest police near Kampala Road, decline-confirmation case.
