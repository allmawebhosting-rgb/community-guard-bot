# Match the incoming emergency call screen to the supplied references

## Result
Rebuild the receiver overlay to follow the uploaded desktop and mobile layouts closely while preserving every existing call, location, map, nearby-help, and emergency-chat behavior.

## Desktop
- Add the dark Allma navigation rail shown in the reference, with Emergency active and the existing destinations available.
- Use a compact dark top status bar with incoming-emergency state, case identity, and emergency type.
- Arrange the main screen as a wide two-column workspace: caller/action/map/help content on the left, emergency details/location/quick actions on the right.
- Combine the caller identity, emergency reason, location, privacy note, Decline, and the dominant green Answer action into one dark emergency panel.
- Present emergency facts as a compact four-cell strip, then a wide Google map and a three-column nearby-help row.

## Mobile
- Remove the desktop rail and side information column.
- Use the compact Allma header and Close control shown in the reference.
- Keep the emergency banner, caller identity, emergency type, location, privacy note, and Answer/Decline controls together above the fold.
- Place the four emergency facts, map, GPS actions, nearby-help cards, and emergency chat below in a single scrollable column.
- Keep Answer and Decline immediately reachable without covering content.

## Visual system
- Scope a dedicated receiver theme to this overlay: deep navy/black chrome, white information surfaces, emergency red, action green, teal safety accents, fine blue-gray borders, and restrained glows.
- Use compact typography, 6–12px radii, stable map/card dimensions, and subtle emergency pulse/rise motion with reduced-motion support.
- Preserve readable contrast and prevent clipping or horizontal overflow at phone and desktop widths.

## Functional boundaries
- Keep incoming-call detection, ZEGOCLOUD setup, Answer, Decline, mute, speaker, end call, caller data, emergency type, severity, location, GPS accuracy, Google Maps, nearby places, Directions, Copy GPS, shared emergency chat, loading, connection, and error states unchanged.
- Make presentation-only changes in the receiver call component and shared styles; shared map/help behavior remains intact.

## Verification
- Run the project typecheck.
- Review the receiver overlay at approximately 1280×900 and 390×844, checking layout, overflow, readable text, and visible controls.
- Verify incoming, active, ended, loading, and missing-location/error presentations remain supported in the rendered structure.
