# Fix the mobile SOS page (and the duplicated map)

## Why the map appears twice

On the live SOS screen the LOCATION section renders the live map, and the emergency chat strip on the same screen (`SosRoomStrip` → `EmergencyRoom`, compact) renders its own copy of the same live map for the sender's location. On desktop these land in two different columns, so it reads as two panels; on mobile everything is one column, so the sender sees the identical map twice, one above the other.

## What will change

### 1. One map per screen

- When the emergency room is embedded on the sender's own SOS screen, hide the room's location map (the sender already has the LOCATION card). Add a `showLocation` switch to `EmergencyRoom` and pass it as off from `SosRoomStrip`.
- The Call Centre / receiver view keeps its map exactly as today, since that is the only place a responder sees the sender's location.

### 2. Mobile layout polish on the live SOS screen

- Tighten the mobile vertical rhythm: smaller section paddings and heading spacing at base width, promoting to the current spacing from `sm:` up, so the screen shows response status, voice and immediate actions without a long empty scroll.
- Make the SOS header compact and sticky on mobile (status line + session id + Close), so Close stays reachable while scrolling.
- Keep the map collapsed by default on mobile behind the existing View map button (it stays inline on desktop), so the phone view leads with actions, not a tall map.
- Guard the header row against narrow widths: two-column grid with `min-w-0` / truncation for the session id and emergency type, `shrink-0` for the Close button.
- Add bottom safe-area padding so the last action is not under the home indicator, and make sure no section can overflow horizontally.

## Technical notes

- Files: `src/components/allma/calls/emergency-room.tsx` (optional location map), `src/components/allma/sos/sos-room-strip.tsx` (pass the flag), `src/components/allma/sos-experience.tsx` (mobile spacing, sticky header, map default state).
- Presentation only: no changes to SOS activation, escalation/calling, chat messaging, or location persistence.
- Verification: Playwright at 390x844 with location granted to confirm exactly one map element in the DOM with the chat strip open, plus a desktop pass at 1338x897 to confirm no regression.
