# One-tap SOS activation

Today, reaching help takes four taps: SOS tab → big SOS button → pick emergency type → confirm consent. In a real emergency that's too slow. This change makes tapping the SOS tab activate emergency mode immediately.

## New behaviour

- Tapping SOS in the bottom bar / sidebar goes straight to the live emergency screen: location capture starts, the emergency activity is recorded, nearby hospitals/police load, and nearby responders are alerted.
- Defaults used on instant activation: emergency type "Other / unspecified", location sharing on, responder notification on — the same defaults the consent screen already pre-selects.
- On the live screen the user can change the emergency type and toggle location sharing / responder alerts at any time, so consent stays reversible rather than removed.
- The idle screen and type-picker remain reachable: arriving at `/sos` from anywhere other than the SOS tab (deep link, refresh) shows the current idle screen so nothing activates accidentally.
- "I'm safe — close" still resets back to idle.

## Technical notes

- `src/components/allma/app-shell.tsx`: the SOS tab links to `/sos` with a search param (e.g. `?instant=1`) on both mobile and desktop entries.
- `src/routes/sos.tsx`: validate the optional search param and pass it into `SOSExperience`.
- `src/components/allma/sos-experience.tsx`:
  - accept an `instant` prop; when true, initialise `phase` to `loading` and fire `activateEmergency()` once on mount (the existing `activated` ref already guards double-runs).
  - add a small controls block on the live help screen for changing emergency type and toggling location sharing / responder alerts, reusing the existing toggle component.
- No backend or schema changes; the existing `safety_activity` insert and responder-offer RPC are unchanged, and responder privacy rules stay as-is.
