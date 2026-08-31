# Share the SOS location and map with the people being called

## What's actually wrong

Two separate gaps, both confirmed:

1. **The location is never saved to the emergency session.** Every SOS session row in the database
   still has empty coordinates and "Location pending" as its area — including the sessions from last
   night. The SOS screen keeps the GPS fix in the page's own state (which is why the person in
   trouble sees their map), but the write to the emergency session only happens in one narrow path:
   if the sign-in session hasn't hydrated at the moment SOS fires (exactly what happens on
   `/sos?instant=1` and on the automatic smart-detection activation), the session row is created a
   moment later by the recovery path and the location write is skipped forever. Live GPS updates
   during the emergency are never written either.
2. **The receiver's call screen has no map.** Even with coordinates present, the incoming-call screen
   only shows one line of text and a "Open in Google Maps" link — so it reads as
   "Location not shared with you", which is what the screenshot shows.

## The fix

**Save the location, always and continuously**

- Move the location write out of the activation function into a dedicated effect that fires whenever
  an emergency session id and a GPS fix both exist — so it no longer matters which of the two
  arrives first, or whether SOS was started manually, from `instant=1`, or by smart detection.
- Keep writing during the emergency: the existing live GPS watcher pushes updates to the session
  (throttled to roughly every 10 seconds, or sooner if the position moves meaningfully), so
  responders track a live position rather than the first fix.
- Preserve the consent flags and accuracy already stored on the session with each write, and keep
  respecting "don't share my location" — when the user opts out, nothing is written, exactly as now.
- Surface a single quiet warning if the write fails, instead of failing silently.

**Show a real map to the person being called**

- Extract the OSM tile map already used on the SOS page into a shared component and render it on the
  emergency call screen (both while ringing and once connected), centred on the caller's shared
  position with the marker, accuracy ring, coordinates and the existing Google Maps / directions
  link.
- Keep the emergency card's text summary (emergency type, severity, area, accuracy) above the map.
- Refresh the caller's position while the call screen is open (poll the existing secure emergency
  context call every ~10 seconds) so the receiver sees the live position move.
- When the caller has not shared location, the card keeps its current honest "Location not shared
  with you" state — no placeholder map.

Privacy is unchanged: the receiver only ever gets what the existing secure server-side emergency
context already permits (consent flag or per-contact share setting), no phone numbers, no extra data.

## Technical notes

- `src/components/allma/sos-experience.tsx`: replace the inline post-activation `safety_activity`
  update with a `useEffect` keyed on `sosActivityId` + rounded coordinates; throttle with a ref.
- Move `OsmTileMap` / `LiveLocationMap` into `src/components/allma/live-location-map.tsx` and import
  it from both the SOS page and the call screen (no visual change on SOS).
- `src/components/allma/calls/call-center.tsx`: render the shared map inside the emergency block when
  `location_shared` is true, and re-run `getEmergencyCallContext(callId)` on a 10s interval while the
  call is active.
- No database migration needed: the update policy on the session table and the
  `get_emergency_call_context` function already allow this; the data was simply never written.
