# Cleaner SOS screens + real nearby help on the map

Two goals: make the emergency screens look calm and organised on phone and desktop, and show real nearby help places (police, clinics, hospitals) with phone numbers to both the person in danger and the people answering the call.

## What the person in danger sees

- One clear column on the phone: status header, big location card with the Google map, then "Help near you", then their Safety Network and call options.
- The map shows their own position plus pins for nearby police, clinics and hospitals. Tapping a pin highlights that place in the list below.
- Each help place shows name, type badge, distance, and a Call button when a phone number exists (an in-app-safe tel action for official emergency services only, never for members).
- Consistent card style, spacing and type sizes throughout; the map stays visible instead of hiding behind a toggle, and nothing overflows sideways.

## What the receiver sees (Call Centre / incoming call)

- Reorganised layout: who is calling and the emergency type at the top, then the caller's live location map, then "Help near the caller", then the chat, with Answer/Decline always reachable at the bottom on phones.
- Same Google map, but centred on the caller, showing pins for police, clinics and hospitals close to the caller so a receiver can pick the fastest place to bring help, plus an "Open directions" link to the caller.
- Each nearby place lists distance from the caller and its phone number where available.

## Technical notes

- Reuse the existing `getNearbyPlaces` server function (Google Places New via the connector, seeded facilities as backup). No new backend tables.
- Extend `src/components/allma/live-location-map.tsx` with an optional `places` prop so it renders help markers (distinct colours per type) and calls back on marker click; keep the existing OpenStreetMap fallback path working with the same markers.
- New shared presentational component `src/components/allma/nearby-help-list.tsx` used by both the SOS screen and the Call Centre, so styling stays identical.
- In `src/components/allma/sos-experience.tsx`: keep current facility loading, feed the same list into the map and the new shared list, drop the map show/hide toggle, and normalise card/section styling in `MinimalEmergencyScreen`.
- In `src/components/allma/calls/call-center.tsx`: fetch nearby places from the caller's shared coordinates (cached, capped at 8 results, single call per location change) and render map + shared list; keep the pinned action bar.
- Frontend only; no schema or RLS changes. Verify with a typecheck and a browser pass on mobile and desktop widths.
