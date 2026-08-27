# Fix the SOS page crash

The SOS page shows "This page didn't load" because the last round of changes was applied only partially, leaving three files in a broken state. The database side is already correct — only the app code needs repairing.

## What is broken right now

1. `src/lib/sos-calling.ts` — a new `accuracy_m` field was inserted into the wrong place: it landed inside a helper function body instead of in the emergency-context type. This alone breaks every page that imports SOS calling, including `/sos`.
2. `src/components/allma/sos-experience.tsx` — the emergency call list is now asked for a `microphoneStream`, but the two screens rendering it (the minimal emergency screen and the full help screen) never receive it as a prop, so the name is undefined.
3. `src/components/allma/calls/call-center.tsx` — the incoming-call card reads `accuracy_m`, which is not declared on the context type yet (fixed by item 1).

## The fix

- Move `accuracy_m: number | null` into the `EmergencyCallContext` type in `src/lib/sos-calling.ts` and restore the helper function to its correct single-purpose body.
- Add a `microphoneStream?: MediaStream` prop to the minimal emergency screen and the help screen in `sos-experience.tsx`, and pass the already-existing `microphoneStream` state down from the SOS container to both, so the microphone captured on the SOS tap is reused for automatic calls.
- Leave the incoming-call GPS-accuracy display as written; it becomes valid once the type is fixed.

## Verification

- Typecheck must come back clean (currently 6 errors across these three files).
- Load `/sos` in the preview and confirm the emergency screen renders with the Safety Network call list instead of the error page.
- Confirm the incoming-call card still shows the emergency block with area, GPS accuracy and the map link.

No database, RLS or backend changes are needed — the emergency context function already returns `accuracy_m`.
