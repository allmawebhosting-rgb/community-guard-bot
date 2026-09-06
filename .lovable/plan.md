# Organise both SOS screens so all information is visible

Rework the active SOS screen for the person in danger and the incoming-call screen for the receiver. Keep the existing real SOS, calling, location, nearby-help, and chat behavior unchanged; this is a presentation and information-order update.

## Caller SOS screen

- Use one continuous mobile scroll with this emergency-first order:
  1. SOS status, emergency type, session ID, and Close
  2. Current Safety Network call status and each real contact status
  3. Immediate actions
  4. Shared location and Google map
  5. Nearby police, clinics, hospitals, addresses, distances, phone numbers, and directions
  6. Emergency chat
  7. Allma voice/status and incident-report action
- Remove the generic “More” drawer as a hiding place for information; show every useful section inline with clear headings.
- Keep unavailable states visible and explicit, such as location permission needed, nearby places loading, no places found, or no Safety Network members.
- On desktop, use a balanced two-column command layout: response/actions/chat on the left and location/map/nearby help on the right. Each column remains independently readable without narrow phone-width content or large empty side gaps.

## Receiver incoming-call screen

- Put caller identity, emergency type, severity, live call status, area, and GPS accuracy together in one compact summary at the top.
- Follow with the caller’s Google map, nearby-help list, and the shared emergency chat so the receiver does not have to leave the call screen to see or send messages.
- Keep Answer/Decline visible in a fixed bottom action area on phones while the information above scrolls; after answering, keep Mute, Speaker, and End equally reachable.
- Reserve enough bottom space in the scrolling content so the last nearby place or chat message is never covered by the call controls or the iPhone safe area.
- On desktop, use a wide two-column layout: caller/call controls in a stable left rail and location/help/chat in the right content area.

## Shared presentation rules

- Use consistent section surfaces, spacing, headings, and status treatments across both ends.
- Ensure long names, addresses, emergency IDs, phone numbers, and labels wrap or truncate safely without horizontal overflow.
- Keep one map per screen and reuse the existing selected-place link between map pins and the nearby-help list.
- Preserve privacy rules: member calls remain in-app and no member phone numbers are exposed; official help-place phone numbers remain callable where Google provides them.
- Do not add simulated responder, dispatch, or arrival statuses.

## Technical details

- Reorganise `MinimalEmergencyScreen` in `src/components/allma/sos-experience.tsx` without changing SOS activation or escalation logic.
- Reorganise `src/components/allma/calls/call-center.tsx` and render the existing shared emergency room inline when an SOS room exists.
- Adjust the shared SOS chat, nearby-help list, and map presentation only where needed for height, overflow, and consistent section styling.
- Verify type safety plus browser layouts at phone and desktop widths, checking that all sections are reachable, exactly one map is present on each side, and the fixed call controls do not cover content.
