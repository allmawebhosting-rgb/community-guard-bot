# Fix the SOS page on desktop: real desktop layout + one clean map

## What's wrong today

The active SOS screen (`MinimalEmergencyScreen`) is the only screen shown once SOS is live, and it is built as a single narrow phone column (`max-w-xl`) centred on the page. On a 1338px desktop window that reads as "a mobile app in the middle of the screen", with lots of empty space either side.

A second, wider two-column SOS layout (`HelpScreen`) still exists in the file but is never rendered.

The location map (`LiveLocationMap`) renders a fixed 208px-tall strip with a fixed 5x3 grid of 256px map tiles. On a wide desktop card that grid does not cover the card cleanly, so the map reads as tiled/duplicated segments rather than one continuous map.

## What will change

### 1. Desktop layout for the live SOS screen

Keep the phone experience exactly as it is today (unchanged at small widths). At `lg` and above, lay the same sections out as a wide command view:

```text
+-------------------------------------------------------------+
|  SOS ACTIVE · LIVE   session id · emergency type    [Close] |
+---------------------------+---------------------------------+
| Emergency calling         |  Location + live map            |
| Room strip / Allma voice   |  (single, full-width map card) |
| Immediate actions         |  Nearby help (hospitals/police) |
+---------------------------+---------------------------------+
```

- Widen the page container on desktop (roughly `max-w-6xl`) while the mobile column stays `max-w-xl`.
- Two columns at `lg+`: left = calling, room, voice, immediate actions; right = location/map and nearby help.
- Section paddings, type scale and card radii scale up slightly on desktop so it does not look like stretched mobile.
- The "More" sheet, emergency-services sheet and close-confirm dialog keep working, centred as dialogs on desktop.

### 2. One clean map

- Show the map inline on desktop (no "View map" tap needed there); keep the View/Hide toggle on mobile.
- Make the map card taller on desktop and have the tile layer fill its measured container size instead of a fixed 5x3 grid, so it renders as one continuous map with no repeated/edge tiles.
- Guarantee a single map instance is mounted per screen (Google Maps when the browser key works, OpenStreetMap fallback otherwise) — unchanged behaviour, just no duplicate/partial tiling.

### 3. Cleanup

Remove the unused `HelpScreen` layout so there is one source of truth for the live SOS screen.

## Technical notes

- Files: `src/components/allma/sos-experience.tsx` (MinimalEmergencyScreen layout, drop dead `HelpScreen`), `src/components/allma/live-location-map.tsx` (container-measured tile grid, responsive height).
- Presentation only: no changes to SOS activation, escalation/calling logic, location persistence, or any queries.
- Verification: Playwright at 1338x897 and at a mobile viewport, screenshotting the live SOS screen to confirm the desktop layout fills the width and exactly one continuous map is drawn.
