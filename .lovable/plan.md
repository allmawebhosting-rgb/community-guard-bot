# Real-time nearby help with Google Maps

Today the Nearby page lists only the seeded `facilities` table, with no map, no live distances, and no way to find other ALLMA members around you. This plan connects Google Maps Platform for live places, and adds an opt-in "neighbours active nearby" layer that ties into the existing Safety Network connection requests.

## What you get

**1. Live nearby hospitals and police stations**
- The Nearby page asks for your location once, then shows a real map with your position and pins for hospitals, clinics, police and fire stations around you.
- Results come from Google Places (live, real businesses) merged with the existing seeded Ugandan facilities, deduplicated by name/coordinates, sorted by real distance.
- Each card shows name, real distance ("1.2 km"), open-now when Google reports it, phone number when available, and Directions.
- If location is denied, the page falls back to today's district-based list — nothing breaks.

**2. Neighbours active on the app (opt-in)**
- A "Neighbours nearby" section shows members who have explicitly switched on nearby presence and checked in recently (fresh within ~15 minutes).
- Each entry shows photo, display name, verified badge and approximate distance only — never coordinates, never phone, never an address.
- One button per person: Send connection request, using the existing Safety Network request flow (pending / accept / decline, same inbox and notifications).
- A clear toggle plus explanation in Profile: "Let nearby members see that I'm active" (off by default), with a Stop sharing button that deletes your presence row immediately.
- If nobody nearby has opted in, the section says so plainly instead of inventing people.

**3. Emergency reuse**
- The SOS screen's "nearest facility" cards use the same live Places lookup, so hospital/police suggestions during an emergency are real and distance-accurate.

## Privacy rules enforced

- Presence sharing is explicit opt-in, expires on inactivity, and can be revoked in one tap.
- Distance is computed server-side; the API response contains no latitude/longitude for other people.
- Discovery is capped (radius and result count) and only returns members who allow discovery.

## Technical notes

- Connect the `google_maps` connector first (needed for both server Places calls and the browser map key). All Places/Geocoding calls go through the Lovable connector gateway from server functions — never from the browser, never with the server key in client code. Map rendering uses `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` with `loading=async` + callback, `google.maps.Marker` only, no `mapId`.
- New `src/lib/places.functions.ts` (thin `createServerFn` wrappers) + `src/lib/places.server.ts` calling `places/v1/places:searchNearby` with a narrow field mask (`displayName,formattedAddress,location,nationalPhoneNumber,currentOpeningHours.openNow,primaryType`). Inputs validated with Zod, radius capped at 10 km, max 20 results, results cached per rounded lat/lng+type for a few minutes to bound Maps cost.
- Map component lives in its own module, loaded with `React.lazy` behind `<ClientOnly>` so the Maps script never enters the SSR graph; shared types/data stay in a browser-safe module.
- Migration adds `public.member_presence` (`user_id` PK, `lat`, `lng`, `geohash`, `updated_at`, `sharing_enabled`) with GRANTs, RLS allowing each user to write only their own row and read none directly, plus security-definer `upsert_member_presence(lat, lng)` and `find_nearby_members(radius_m)` returning `user_id, full_name, avatar_url, phone_verified, distance_m, relationship_state` for fresh, opted-in rows only. Adds `profiles.discoverable_nearby`.
- Nearby member cards call the existing `send_safety_connection_request` RPC via `src/lib/safety-network.ts` — no second connection system.
- Nearby page gets a map/list split (map on top, list below on mobile), keeping the current Uganda-palette card styling.
