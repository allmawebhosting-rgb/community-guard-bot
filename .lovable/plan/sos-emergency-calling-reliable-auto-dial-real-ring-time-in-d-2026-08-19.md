# SOS emergency calling: reliable auto-dial, real ring time, "in danger" announcement

## What's wrong today (verified in code)

- The escalation card is rendered twice on the SOS screen (`sos-experience.tsx` lines 3155 and 3194 — one mobile column, one desktop column). Both mount, both auto-start, so two independent dialers fight over the same emergency: one places a call while the other sees a terminated attempt and jumps to the next contact. This is the most likely reason a call ends almost immediately and never connects.
- Escalation stops after a single pass through the contact list (`exhausted`), so it does not "keep trying all possible routes".
- Advance delay is 1.5s and the caller's ring window is a fixed 45s in `call-center.tsx`; escalation also advances on any terminal status, including a `failed` caused by the duplicate dialer.
- The incoming screen shows the emergency type but never says plainly that the person is in danger, and there is no audible announcement.

## What will change

1. **One dialer per emergency.** Render the escalation card once on the SOS page (shared between the mobile and desktop layouts) so only one dialer exists. Add an in-module guard so a second mount cannot start calls for the same SOS session.

2. **Automatic, continuous escalation.** Auto-start as soon as the SOS session exists, call contacts one by one in priority order, and after the last contact wait a short pause and start another round — repeating until someone answers, the user stops it, or the SOS is closed. The card shows the current round and which contact is ringing, all from real call rows.

3. **Longer, honest ring window per attempt.** Each attempt rings for a configurable window (about 30s) and only advances when the server marks that attempt declined/missed/failed/ended — never on a transient state. The caller screen keeps ringing for the whole window instead of dropping early, and the "next contact in Xs" gap is shown.

4. **"<Name> is in danger" on the incoming call.** For calls linked to an SOS, the recipient's screen leads with "<Caller first name> is in danger" plus emergency type, severity and (only if shared) area. Adds a spoken announcement via the browser speech synthesis on the incoming screen and uses the same wording in the push notification title, so a recipient who only hears the phone still learns what it is.

5. **Connection reliability fixes.** Caller stays in a ringing state until the callee's answer produces real audio; failures surface the actual reason instead of a silent teardown; a failed attempt is retried once on the next round rather than skipped forever.

## Not included

No simulated call states, no claims that police/ambulance were contacted, no dialer or phone-number exposure. Escalation still only runs while the SOS screen is open, and the UI keeps saying so.

## Technical notes

- `src/components/allma/sos-experience.tsx`: single mount of `EmergencyCallEscalation`.
- `src/components/allma/sos/emergency-call-escalation.tsx`: round-based loop, per-attempt timeout, round counter, retry of failed attempts, stop/resume control.
- `src/components/allma/calls/call-center.tsx`: emergency headline copy, speech announcement, ring-window handling driven by call status.
- `src/lib/push.functions.ts` (or its server counterpart): emergency notification title wording.
- No database or RPC changes needed — `list_sos_call_targets`, `start_sos_emergency_call`, `list_sos_call_attempts` and `get_emergency_call_context` already provide everything.
