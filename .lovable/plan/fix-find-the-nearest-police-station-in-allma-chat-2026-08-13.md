# Fix "find the nearest police station" in Allma chat

Right now asking for the nearest police station gets a generic welcome message and a loop of "share your area", instead of an actual station. Three separate causes.

## What's wrong today (verified)

1. **The assistant can't use GPS.** The facility lookup tool only accepts a text `area` string and matches it with a name/district/address text search. When you tap "Share my location", the app sends `My current location is: 0.31234, 32.58123` — no district name — so the text search finds nothing and the assistant falls back to asking for an area again.
2. **"Nearest" is not actually computed.** All 50 directory facilities (18 police, 17 hospital, 15 fire) do have real coordinates, but nothing ranks them by distance — the tool returns the first text match.
3. **No location button when the assistant asks in prose.** The app only shows a tappable "Share my location" card when the model uses the media-request tool with type `location`. When it asks for the area as plain text (what happened here), the user gets no button, only chips like "Report a crime / Find help nearby".

The repeated welcome message is a prompt-adherence problem: the greeting script is meant only for a user who opens the app *without* a specific request. The exact reason it was echoed back is not confirmed, so step 4 below both tightens the rule and adds a guard.

## The fix

1. **Real nearest-facility lookup by coordinates**
   - Extend the facility lookup tool to accept optional latitude/longitude alongside the area text.
   - When coordinates are present, rank the directory by great-circle distance and return the closest police station, hospital and fire station with a real distance in km (computed, not estimated) — plus phone, address and 24/7 status.
   - When only text is available, keep today's text matching.
   - Keep the honest fallback: if nothing is in the directory for that area, say so and give the national numbers.

2. **Pass the user's coordinates through**
   - The app already sends coordinates as text when the user shares location. The chat endpoint will extract them from the latest user message and hand them to the model as known context, so the lookup runs with coordinates instead of a failed name match.

3. **Always offer a one-tap "Share my location"**
   - Add a "Share my location" chip whenever the assistant's last message asks for an area, landmark or location and no other action card owns the chip row, so the user is never stuck typing.
   - Instruct the model to use the location media-request card (which already renders a Share-location button) when it needs a place.

4. **No greeting on a specific request, no repeats**
   - Prompt rules: skip the welcome/tour script whenever the first user message is a concrete request such as "find the nearest police station" — answer the request directly; and never restate a message already sent in this conversation.
   - Server guard: include the assistant's previous message in the request context with an explicit instruction not to repeat it.

## Technical notes

- `src/routes/api/chat.ts` — `location_intelligence` tool: add optional `latitude`/`longitude` to the input schema, haversine ranking over `facilities` rows that have coordinates, return `distance_km` per facility; add coordinate extraction from the last user message into the system context block; add the "last assistant message, do not repeat" block.
- `src/lib/allma-prompt.ts` — greeting-only-when-no-request rule, no-repeat rule, use the location media request instead of prose when a place is needed, and state distances only when returned by the tool.
- `src/components/allma/allma-chat.tsx` — station card renders the returned `distance_km`; add the location fallback chip in `contextualChips` driven by the assistant's last text.
- No schema changes; facility coordinates already exist.
