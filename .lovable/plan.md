# Make real hospitals, clinics and police stations appear

Right now the nearby-help lists and map pins come back empty everywhere (SOS screen, incoming call, Nearby page). I confirmed the cause by calling Google directly with the app's own settings.

## What is wrong

1. The request asks Google for a place category called "clinic", which Google does not accept. Google rejects the whole request with "Unsupported types: clinic", so nothing at all comes back — not even hospitals or police.
2. The list of fields the app asks for is written in the old format, which Google also rejects for this kind of search.
3. When Google refuses, the app silently returns an empty list, so the screens just say "none found" instead of showing anything is wrong.
4. The Google credentials are read once when the server starts instead of when a search runs, so they can be missing at search time and the app quietly skips Google altogether.

With the categories corrected, the same search returns real places with real phone numbers (verified live: two health centres and clinics near Kampala with dialable numbers).

## The fix

- Use Google's supported categories: hospital, police, fire_station, doctor, pharmacy — and quietly drop or translate any unsupported category (clinic -> doctor) instead of failing the whole search.
- Correct the requested field list so Google returns name, address, phone, opening status, coordinates and type.
- Read the Google credentials at search time, and log the exact Google status and message when a search fails so problems are visible instead of silent.
- Keep the saved local facilities as a backup and merge them with the Google results, closest first, as today.
- Update the three places that request nearby help (SOS screen, incoming call screen, Nearby page) to pass the supported categories.

## Technical notes

- `src/lib/places.server.ts`: move `LOVABLE_API_KEY` / `GOOGLE_MAPS_API_KEY` reads inside `loadGooglePlaces`; add a `SUPPORTED_PLACE_TYPES` allowlist plus alias map (`clinic|health|medical -> doctor`, `fire -> fire_station`); prefix the field mask entries with `places.` (`places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.currentOpeningHours.openNow,places.primaryType`); log status + body on non-OK responses; fix default types.
- `src/lib/places.functions.ts`: default types to the supported set.
- `src/routes/nearby.tsx`, `src/components/allma/sos-experience.tsx`, `src/components/allma/calls/call-center.tsx`: request `["hospital","police","fire_station","doctor","pharmacy"]`.
- No schema, RLS or design changes. Verify with a typecheck plus one live nearby search through the connector and an authenticated browser pass on the SOS screen.
