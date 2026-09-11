# Rebuild the live SOS screens into a clear premium command layout

The screenshots confirm that the current live caller screen is not matching the approved Tactical Command View: related information is split across disconnected columns, the Immediate Actions panel stretches into a large empty box, the location/help content falls into a narrow rail, and nearby-place names wrap one letter or word at a time. This will be a presentation-only correction for both caller and receiver screens.

## Caller live SOS screen

- Replace the fragile row-positioned grid with a deliberate desktop command layout:
  - compact left rail for SOS status, Safety Network progress, and immediate actions;
  - wide main column for live location, the Google map, and nearby help;
  - balanced independent sections so no card stretches to fill unused height.
- Keep the active SOS header compact and prominent, with the real reference, emergency type, live indicator, and Close action.
- Place the map high in the main column and give it a stable, useful desktop height.
- Show nearby places in full-width professional rows on normal desktop widths; only use two columns where each result remains wide enough for names, addresses, phone numbers, Directions, and Call.
- Prevent long place names and addresses from breaking into narrow vertical text. Preserve readable wrapping and minimum content widths.
- Keep phone layout as one clear sequence: live status → Safety Network → immediate actions → map → nearby help, with no sideways overflow.

## Receiver incoming SOS screen

- Match the same command system with a dark caller/status rail and a wide emergency-information area.
- Keep emergency details, caller map, nearby help, and shared chat in a clear vertical order within the wide area.
- Remove unnecessary stretching and nested frames so every section uses the available screen width naturally.
- Keep Answer/Decline permanently reachable on phones and retain Mute, Speaker, and End after answering.
- Ensure long caller names, locations, and nearby-place details remain readable on phone and desktop.

## Premium visual and motion treatment

- Strengthen the locked Signal Ivory system: warm ivory canvas, crisp near-black hierarchy, Uganda red for emergency emphasis, and restrained Uganda gold highlights.
- Use layered red-to-gold light sweeps in the header and subtle animated gradient movement across the command canvas—never behind dense text at a strength that reduces contrast.
- Give panels consistent borders, compact radii, restrained shadows, accent rails, and clear spacing instead of oversized empty card surfaces.
- Add short staggered fade/rise entrances for major sections, tactile action feedback, and a pulse only for genuinely live status.
- Respect reduced-motion preferences and remove any animation that causes blinking, layout movement, or readability loss.

## Functionality preserved

- Keep all current SOS activation, Safety Network calling/retries, emergency-services actions, Stop SOS, incident reporting, Google Maps, live location, nearby Google Places, phone numbers, Directions, shared emergency chat, ZEGOCLOUD controls, auth, database, notifications, and routing unchanged.
- Do not add simulated responders, calls, dispatch, or status information.

## Technical approach

- Refactor only presentation structure/classes in `sos-experience.tsx`, `call-center.tsx`, `nearby-help-list.tsx`, and the shared SOS style utilities.
- Remove conflicting legacy SOS selectors where they override the command design, rather than stacking more high-specificity overrides.
- Replace fixed/stretch-prone grid rows with explicit responsive columns and intrinsic-height sections.
- Add minimum-width safeguards and responsive list breakpoints for nearby-place cards.

## Verification

- Review the active caller screen at approximately 1366×768 and 390×844, confirming the map/help area uses the canvas, no large empty action panel remains, and every nearby-place label is readable.
- Review the incoming receiver screen at the same sizes, confirming all emergency information is reachable and call controls remain visible.
- Check no horizontal overflow, clipping, blinking, low-contrast text, or overlapping controls.
- Confirm every existing SOS, map, nearby-help, chat, calling, and report control remains present and type safety passes.
