# Premium Tactical Command SOS screens

Apply the selected **Tactical Command View** to both the caller’s active SOS screen and the receiver’s incoming-call screen. Keep every existing feature and emergency workflow unchanged.

## Caller SOS screen

- Use a compact near-black live-status header with the real SOS identifier, emergency type, live indicator, and existing Close action.
- Rebalance the desktop view into a stable command layout: Safety Network and immediate actions in the left rail; live location, Google map, and nearby help in the larger right area.
- Keep phone layout as one continuous, readable column with no horizontal overflow or clipped controls.
- Refine cards into tighter warm-ivory panels with restrained borders, Uganda-red emergency emphasis, sparing gold signal accents, and subtle gradient illumination.
- Preserve Emergency Services, File Incident Report, Stop SOS, location permission, map pins, nearby facilities, phone numbers, Directions, and all confirmation dialogs.

## Receiver SOS screen

- Give the caller identity/status rail a strong near-black command treatment while keeping the caller image, emergency summary, call state, timer, and privacy message visible.
- Organize the information column in this order: emergency details, caller map, nearby help, then shared emergency chat.
- Keep Answer/Decline fixed and reachable on phones; retain Mute, Speaker, and End controls during active calls.
- Use a wide asymmetric desktop layout and a single scrollable mobile layout so long names, addresses, facility lists, and chat content remain accessible.

## Shared map and nearby help presentation

- Keep Google Maps, the existing fallback, caller marker, nearby-place markers, selection behavior, and Directions unchanged.
- Make the map the visual center of the command layout with a stable responsive height and precise frame.
- Present nearby places as compact professional rows/cards with readable type, distance, address, phone, Call, and Directions actions.
- Remove visual instability: no blinking list content, continuous card motion, or low-contrast text.

## Motion and visual system

- Use the locked Signal Ivory palette, Space Grotesk headings, and DM Sans body text.
- Add restrained 200–300ms entrance transitions, tactile button feedback, and a pulse only for genuinely live status.
- Respect reduced-motion settings and keep emergency information readable throughout every animation.

## Technical boundaries and verification

- Presentation-only changes in the existing SOS, call-centre, nearby-help, map, and shared style files.
- No changes to SOS activation, calling, ZEGOCLOUD, responder states, location sharing, nearby-place requests, chat, auth, database, notifications, APIs, or routing.
- Verify type safety and inspect caller and receiver layouts at phone and desktop sizes, checking that every existing control remains visible and usable.
