# Fix SOS auto-calling: show your network and dial it automatically

## What's happening

The SOS "Safety Network" card stays on "Checking eligible contacts…" and never places a call.

The dialer lives in one shared controller per emergency (`src/lib/sos-escalation-controller.ts`), and the card unsubscribes on every re-render caused by a changed emergency type. When the subscriber count briefly hits zero, the controller disposes itself: it stops dialing, is removed from the registry, and marks itself already-initialised. The card then re-subscribes to that same dead instance, `init()` returns immediately, so the loading state never clears and no call sequence ever starts.

This also explains "no calls are placed automatically": once disposed, `autoStart` never runs again.

## The fix

1. **Reference-count the controller instead of disposing on the first unmount.**
   Track subscribers; when the count drops to zero, wait a short grace period (a few seconds) before tearing down. A re-subscribe inside that window cancels the teardown, so re-renders no longer kill the dialer while the SOS screen is still open.

2. **Make the controller re-entrant.**
   - Don't recreate/re-key it on `emergencyType`; keep one controller per SOS activity and just update the type.
   - `init()` becomes safe to call repeatedly: if targets were already loaded it re-checks attempts and re-arms auto-start instead of returning early.
   - Never leave `loading: true` on any exit path.

3. **Always list the connected members.**
   Contacts load and render even before dialing starts, each with its real status ("Alerted", "Calling", "No answer", …) from the actual call rows. If a connection is excluded (calls not allowed both ways, or SOS alerts off), show that reason on the row instead of hiding it, so the list is never mysteriously empty.

4. **Auto-start reliability.**
   When the SOS activity id arrives after mount, auto-start fires then (not silently skipped), and the "Call responders" button stays available as a manual fallback.

No change to how calls are authorised or placed: dialing still goes through the existing in-app call system and every status shown still comes from a real `emergency_calls` row. Nothing simulated, no phone numbers exposed.

## Technical notes

- `src/lib/sos-escalation-controller.ts`: subscriber ref-counting with delayed disposal, idempotent `init`, guaranteed `loading:false`, `setEmergencyType` without re-instantiation.
- `src/components/allma/sos/emergency-call-escalation.tsx`: memoise the controller on `activityId` only, push `emergencyType` via an effect, render targets plus per-row ineligibility reason, keep loading state honest.
- `src/lib/sos-calling.ts`: return excluded connections with a reason (instead of filtering them out of the fallback path) so the UI can explain an empty or partial list.
