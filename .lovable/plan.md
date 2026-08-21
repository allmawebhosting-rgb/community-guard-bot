# Premium SOS report screen — "Split technical overview"

Rebuild the SOS incident report step (and its confirmation screen) to match the chosen direction: a split surface with the live emergency context on the left and the report form on the right, in black with Uganda gold accents and a single red submit.

## What changes visually

Left panel — Incident overview (real data only)
- Session chip with a softly pulsing live dot
- Emergency type, elapsed time (live ticking counter from the activation timestamp), location status, safety-network status
- Status dots: gold for active, green for location acquired, dim grey for unavailable
- Footer note stating the report is stored with a reference code and that Allma does not contact an authority automatically

Right panel — Report form
- "Back to status" link with an arrow that slides on hover
- "Quick incident report" heading in Space Grotesk
- Larger textarea on a near-black inset field, gold focus ring, character counter inside the field (x / 2000)
- Red "Submit report" primary action with a press-scale, plus a quiet "Cancel"
- Single stacked column on mobile; full-width actions

Confirmation screen
- Same dark split-surface language: animated check, reference code in gold on a bordered plate, existing honest wording kept unchanged, "Close SOS" action restyled to match

Motion: staggered fade-up of the context rows, 200–300ms transitions, soft red radial glow behind the card. No new animation library — uses the existing motion/react.

## Honesty and data rules kept

- Every status shown comes from existing state already passed into the SOS screen (emergency type, activation time, location state, responder-sharing consent and responder count). Nothing is invented, no "police contacted" claim, no mock reference code — reference still only appears after a real submit.
- If location is denied or unavailable, that is shown plainly rather than as a success state.

## Technical notes

- Only `src/components/allma/sos-experience.tsx` changes: rewrite `ReportScreen` and `SubmittedScreen`, and pass the already-available context props (`emergencyType`, `emergencyId`, `activatedAt`, `locationState`, `notifyResponders`, `responderOffers.length`) into `ReportScreen` at the existing render site.
- Submit/cancel handlers, `handleSubmitReport`, phase transitions, validation and the 2000-char limit stay exactly as they are.
- Colours follow the locked palette (#0a0a0a / #1a1a1a / #FCDC04 / #D90012) consistently with the sibling fixed-dark emergency screen; fonts use the existing display + body families.
