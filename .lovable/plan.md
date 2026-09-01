# Real nearby hospitals and police stations on the SOS screen

Today the SOS screen gets nearby help from OpenStreetMap's Overpass service, and falls back to a hardcoded "demo" list of Kampala officers when that returns nothing. Overpass rarely has phone numbers or street addresses, so rows show "Nearby" and generic 999/911 numbers. This replaces that with live Google Places data (name, real address, real phone, open-now, distance), keeping the seeded Ugandan facilities as a backup.

## What changes for the user

- Nearest hospitals and police stations on the SOS screen come from Google Places, sorted by real distance from the GPS fix.
- Each row shows the actual place name, formatted address, and its real phone number when Google has one; the emergency short codes (999/911/112) stay available separately as they are today.
- The "(demo)" officers list is removed. If Google returns nothing (no key, no signal, no results), the screen falls back to the seeded facility list already in the database, and shows nothing rather than fake names.
- Same data feeds the compact mobile emergency screen's "nearby help" list.

## Technical notes

1. `src/lib/places.server.ts` — the Google call currently hits `maps.googleapis.com/v1/places:searchNearby` with the key as a query param, which is not how the connector works. Route it through the connector gateway (`https://connector-gateway.lovable.dev/google_maps/places/v1/places:searchNearby`) with `Authorization: Bearer LOVABLE_API_KEY`, `X-Connection-Api-Key: GOOGLE_MAPS_API_KEY`, and the field mask in the `X-Goog-FieldMask` header (not in the body). Add the documented 403 branches (`API_KEY_HTTP_REFERRER_BLOCKED`, `API_KEY_SERVICE_BLOCKED`) so key misconfiguration surfaces as a clear message instead of an empty list. Keep the existing 3-minute in-memory cache and the seeded-facility merge.
2. `src/lib/places.functions.ts` — `getNearbyPlaces` already exists with auth middleware; reuse it unchanged (SOS is an authenticated route). Radius 8000 m, limit 8, types `hospital`, `police`, `fire_station`, `clinic` to match the current Overpass radius.
3. `src/components/allma/sos-experience.tsx`
   - Add a small adapter mapping `NearbyPlace` to the local `Facility` shape (type bucketed into hospital/police from `primaryType`, distance formatted m/km, phone/address passed through, lat/lng kept for the directions link).
   - Replace both `fetchOverpass` call sites (the main activation flow and the compact screen's nearby-help effect) with one `getNearbyPlaces` call each, splitting the result into hospitals and police.
   - Delete `fetchOverpass`, `DEMO_HOSPITALS`, `DEMO_OFFICERS`, `DEMO_COORDS`, `withDistance`, and the `demo` prop on `FacilitySection`; drop the "Officers on duty (demo)" heading in favour of "Nearest police".
   - Keep `haversineKm` (used elsewhere) and the existing empty-state behaviour: no results means the section is hidden, never invented rows.
4. Cost guardrails: one Places request per SOS activation (plus one per compact-screen mount), served from the existing server-side cache keyed to ~100 m / rounded coordinates, so repeated activations from one spot do not re-bill.
5. Verify with a typecheck and by loading `/sos?instant=1` in the preview to confirm real names, addresses, and phone numbers render.
