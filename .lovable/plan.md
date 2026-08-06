# Fix: mobile SOS screen is missing most information

## What's wrong

On the live emergency screen, the right-hand panel is desktop-only. Its container is hidden below the large breakpoint, and a placeholder block at the bottom of the file claims those sections "scroll inline above" on mobile — they don't. So on a phone the SOS screen shows only the AI guidance, the "What to do right now" steps, the timeline and two buttons.

Everything in that panel is invisible on mobile:

- Call now (tap-to-dial emergency numbers)
- Live status tiles (Location / Police / Medical / Community)
- Live map with GPS pulse
- Community responders list
- Officers on duty and nearest hospitals

The idle SOS screen has the same problem on a smaller scale: the Emergency Numbers list next to the big SOS button is desktop-only.

## The fix

Make both layouts render the same content, only arranged differently.

### Live emergency screen
- Extract the panel's sections into reusable blocks (call buttons, live status, map, responders, facilities) so they are defined once.
- Desktop (lg and up): unchanged — left column keeps AI guidance / steps / timeline, right sidebar keeps the extracted blocks.
- Mobile: render one scrolling column in emergency-useful order:
  1. AI live guidance
  2. Call now (dial buttons, full width, large touch targets)
  3. What to do right now
  4. Live status tiles
  5. Live map
  6. Community responders
  7. Officers on duty / nearest hospitals
  8. Emergency timeline
  9. File report + "I'm safe — close SOS"
- Remove the empty placeholder block at the bottom that pretends this already happens.

### Idle SOS screen
- Show the emergency numbers list on mobile too, below the SOS button, as a compact stacked list instead of hiding it.

### Header
- The "File Report" button in the sticky header is hidden below the small breakpoint; keep it hidden there since the mobile column already has a full-width File Report action.

## Technical notes

- All work is in `src/components/allma/sos-experience.tsx`; no data, query or backend changes.
- Sections become small local components taking the existing props/state, rendered from both branches — no duplicated markup, so the two layouts can't drift again.
- Mobile column keeps `max-w-lg` centering and the existing spacing scale; touch targets on call buttons stay at least 44px tall.
- Grids that are 2-up in the narrow sidebar stay 2-up on mobile with `min-w-0` so the phone numbers don't clip.

## Also: existing build errors to clear first

The project currently fails typecheck in the police command center (unrelated to SOS, but blocking a clean build). Fix in the same pass:

- `src/components/police/command-shell.tsx` — nav groups are inferred as mismatched readonly tuples, making `item` `unknown`; give the nav config an explicit item type.
- `src/lib/police.ts` — `"on_leave"` isn't a valid duty status; use one of the real enum values.
- `src/routes/_authenticated/police.ai.tsx` — uses the old `useChat` API (`input`, `setInput`, `handleSubmit`, `isLoading`, `reload`, `api`, `message.content`); port to the current transport/parts API used by the citizen chat.
- `src/routes/_authenticated/police.cases.$caseId.tsx` — typed insert payload instead of `Record<string, unknown>`.
- `src/routes/_authenticated/police.search.tsx` — field names don't match the schema (`description`, `item_name`, `location_found`, `type`); map to the actual columns.
