# Fix receiver Answer and Decline controls

## Result
Keep **Answer** and **Decline** permanently visible at the bottom of the receiver screen while the emergency details, map, nearby help, and chat scroll behind them.

## Changes
- Move the incoming-call action row out of the scrolling caller card into a dedicated bottom action dock.
- Keep the dock aligned with the receiver workspace on desktop and full-width on phones, including safe-area spacing for iPhones.
- Add enough bottom space to the scrollable content so the dock never covers the map, nearby-help cards, chat, or other information.
- Keep active-call Mute, Speaker, and End controls in their existing state and preserve all current Answer and Decline handlers.

## Animation polish
- Give the action dock a short upward entrance with a soft fade when an incoming call appears.
- Add a restrained breathing glow to Answer and a subtle ringing motion to its phone icon.
- Add tactile press feedback to both controls and a calm border emphasis on Decline.
- Disable continuous motion when reduced-motion is enabled.

## Verification
- Check desktop and phone layouts while scrolling from caller details through nearby help and chat.
- Confirm Answer and Decline remain visible, do not cover content, and stay reachable above phone safe areas.
- Confirm both actions still invoke the existing call handlers and the active-call controls remain unchanged.
