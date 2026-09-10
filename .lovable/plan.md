# Restore caller nearby help and fix the receiver SOS screen

Keep all SOS, calling, location, map, nearby-place, chat, privacy, and emergency behavior unchanged. This update repairs presentation and information visibility only.

## Caller SOS screen

- Restore the visible **Help near you** section directly below the caller’s location map.
- Reuse the nearby places already being fetched and already shown as map pins; do not add another request or another map.
- Show every real result with its type, address, distance, available official phone number, Directions, and Call action.
- Keep loading, location-permission, and no-results states clearly visible.
- Preserve the existing link between a selected map pin and its matching help-place row.

## Receiver incoming SOS screen

- Reorganize the information into a clear emergency-first order: caller and SOS summary, emergency details, caller map, nearby help, then shared emergency chat.
- Make the full information area continuously scrollable on phones, with enough bottom space that the fixed Answer/Decline controls never cover the last place or chat content.
- Keep the receiver’s map, nearby-help list, and chat at usable heights rather than allowing nested scrolling areas to cut content off.
- On desktop, retain a wide two-column view: caller/call status in a stable left rail and all emergency information in a readable right column.
- Keep Answer/Decline visible before answering and Mute/Speaker/End visible during the call.

## Visual consistency and safety

- Use consistent section borders, backgrounds, spacing, headings, and readable text contrast across both screens.
- Prevent long caller names, addresses, phone numbers, and labels from causing horizontal overflow.
- Do not remove or alter any existing action, call logic, responder status, location sharing, Google Maps behavior, backend request, notification, or chat behavior.
- Do not introduce simulated emergency or responder states.

## Verification

- Check the caller screen at phone and desktop widths: one map, visible nearby-help list, selectable pins/results, and reachable actions.
- Check the receiver screen at phone and desktop widths: all details scroll into view and call controls do not cover content.
- Confirm type safety and verify that existing call, map, Directions, official Call, chat, and close/end controls remain present.
