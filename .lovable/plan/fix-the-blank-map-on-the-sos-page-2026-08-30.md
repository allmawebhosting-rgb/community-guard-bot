# Fix the blank map on the SOS page

## What's wrong

The SOS page's live-location panel embeds `https://www.google.com/maps?q=...&output=embed` in an
iframe. Google blocks that URL from being framed on other sites, so the panel renders as an empty
grey box — the accuracy ring, marker and coordinates draw on top of nothing.

The Nearby page's map uses the Google Maps JavaScript API and needs
`VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`, which is not configured in this project, so that
path can't be reused as-is either.

## Fix

Replace the broken iframe inside the SOS live-location panel with a real, keyless tile map:

- Render OpenStreetMap raster tiles directly (a 3x3 grid of tile images centred on the user's
  coordinates) — no API key, no new dependency, works on mobile and desktop.
- Keep every existing control and visual exactly as it is: the four zoom tiers (Street / Block /
  Area / City), the +/- and recentre buttons, the pulsing red position marker, the scaled accuracy
  ring, the address line, "Copy GPS" and "Open in Google Maps".
- Tiles are gated to client-side rendering so SSR doesn't attempt image loads, with the existing
  grey surface as the placeholder.
- Add a small graceful state: if tiles fail to load, the panel keeps showing the marker, accuracy
  and coordinates instead of an empty box.

This is presentation-only — no changes to location capture, SOS logic, escalation or calling.

## Technical notes

- Edit `LiveLocationMap` in `src/components/allma/sos-experience.tsx`.
- Map the four existing zoom tiers to OSM zoom levels (18 / 16 / 14 / 12) and convert lat/lng to
  slippy tile x/y, offsetting the grid so the exact position sits at the panel centre — this keeps
  the accuracy-ring scale maths already in the component correct.
- Attribution text ("© OpenStreetMap contributors") is added in the map corner, as OSM tile usage
  requires.

## Optional alternative

If you'd rather have Google's own map here (satellite, place labels, nearby facility pins), the
Google Maps connector can be linked instead and this panel switched to the Maps JavaScript API,
matching the Nearby page. That needs the connector set up first; the OSM fix above works today
with no setup.
