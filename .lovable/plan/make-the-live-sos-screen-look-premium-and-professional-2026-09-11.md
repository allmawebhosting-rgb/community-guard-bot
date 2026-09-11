# Make the live SOS screen look premium and professional

The screenshot shows the live emergency screen with three problems: the contact list on the left grows so tall that Immediate Actions and Help near you fall far below the fold, a placeholder "Safety Network / Friend" row sits above the real contacts, and the soft pink/yellow wash behind the page fights the white cards instead of supporting them. This is a look-and-layout change only — every emergency action, call, map, and data flow stays exactly as it is.

## What changes on screen

**One calm command canvas**
- Replace the broad pink/yellow wash with a restrained ivory canvas and a single narrow red-to-gold light band behind the top header only, so cards read crisply.
- Consistent card language everywhere: same corner radius, same hairline border, same soft shadow, one accent rail on the primary panel.

**Header**
- Keep the dark command header, reference number, emergency type, live dot, and Close button, but tighten it into one compact bar so more of the emergency fits on the first screen.

**Left rail (response)**
- Remove the empty placeholder contact row so the list starts with real people.
- Show the calling progress as a slim summary (status chip, "0/7 contacts", thin progress bar), then the contacts as compact rows with initial, name, relation, and status pill.
- Cap the contact list height with its own quiet inner scroll on desktop, so Immediate Actions is always visible without scrolling the page.

**Immediate actions**
- Keep Call Emergency Services, File an incident report, and Stop SOS, in that order, as a fixed-height panel directly under the response summary — no oversized empty box.

**Right column (location and help)**
- Keep the live status line, area name, Google map with its pins, address, coordinates, Open in Google Maps, and Copy GPS.
- Give the map a slightly shorter desktop height so Help near you is partly visible without scrolling, and put the map and address block in one continuous framed unit.
- Help near you becomes a clean two-column card grid on wide screens with readable names, distance, address, phone, Call, and Directions; single column on phones.

**Motion**
- Short 200–300ms fade/rise on each section once, a pulse only on the genuinely live status dot, tactile press feedback on buttons. No looping animation behind text. Reduced-motion preference respected.

**Phone**
- One clear column: live status → response/contacts → immediate actions → map → help near you, with no sideways overflow and nothing clipped.

## Receiver screen

Apply the same canvas, card, header, map frame, and nearby-help treatment to the incoming SOS screen so both ends look like one product. Answer/Decline stays pinned and reachable on phones; Mute, Speaker, and End stay during active calls.

## Technical notes

- Presentation only, in `src/components/allma/sos-experience.tsx`, `src/components/allma/calls/call-center.tsx`, `src/components/allma/calls/emergency-call-escalation.tsx`, `src/components/allma/nearby-help-list.tsx`, `src/components/allma/live-location-map.tsx`, and the SOS utility classes in `src/styles.css`.
- Drop the leftover placeholder row rendering in the escalation panel; do not touch escalation logic, retries, timers, or Zego wiring.
- Delete conflicting legacy `.signal-*` overrides rather than adding more `!important` layers, so one system wins.
- No changes to SOS activation, calling, location sharing, Places requests, chat, auth, database, notifications, or routing.
- Verify with a typecheck plus caller and receiver reviews at roughly 1392x897 and 390x844: no overflow, no clipped controls, every existing button present.
