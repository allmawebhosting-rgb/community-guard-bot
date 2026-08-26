# Fix SOS calling: ring everyone at once, then keep retrying

## What's actually wrong

The call rows in the database show the cause. During one SOS round three calls were created 3-6 milliseconds apart, and each new one instantly marked the previous one `ended` — none ever reached `ringing`:

```text
20:45:52.880  call A  -> ended at 20:45:52.886
20:45:52.886  call B  -> ended at 20:45:52.890
20:45:52.890  call C  -> initiating (only survivor)
```

The server routine that starts an SOS call ends every other in-flight call from the same caller ("one active call per person"). The SOS dialer is designed to ring the whole Safety Network at the same time, so each contact's call kills the one before it. Whoever taps Answer on a killed row hits the guard on the voice-token endpoint and sees "This call is no longer available."

Retries are also effectively absent: after a round the dialer waits 7 minutes before trying again, so it looks like nothing happens.

## The fix

1. Allow simultaneous calls inside one emergency
   - The SOS call routine stops cancelling sibling calls that belong to the same SOS session. It still clears stale calls from earlier SOS sessions and ordinary (non-emergency) calls.
   - Raise the per-caller attempt limit so a network of several contacts times several retry rounds is not rate-limited mid-emergency.

2. Real retry cadence
   - Ring window per round stays ~40s so contacts get a genuine ring.
   - Gap between rounds drops from 7 minutes to ~20 seconds, so the dialer keeps cycling the whole network until someone answers or the user confirms they are safe.
   - Round number stays visible in the escalation card ("Round 3"), and each contact keeps its real status from its own call row.

3. Stop self-cancelling on the caller's device
   - When a contact answers, the dialer ends only the other rows of the finished round, never the row that just connected, and never rows created after it.
   - The caller's audio session switches to the answered call instead of tearing down and re-creating a session for an already-ended row.

4. Clearer answer-time messaging
   - If a call genuinely ended before the recipient tapped Answer, the message becomes "This call already ended — they may be calling again", instead of the ambiguous "no longer available".

## Technical notes

- Migration: replace `public.start_sos_emergency_call` so the cleanup `UPDATE` excludes rows with the same `sos_session_id` as the current activation, and raise the 10-minute attempt ceiling.
- `src/lib/sos-escalation-controller.ts`: `ROUND_GAP_SECONDS` 420 -> 20; only terminate non-answered attempts from the current round; keep the loop running while no answer and no welfare confirmation.
- `src/components/allma/calls/call-center.tsx`: when a newer SOS row reaches `connecting`/`connected`, do not set the previously tracked SOS row to `ended`; let the controller own cancellation.
- `src/routes/api/zego-token.ts`: keep the terminal-status guard (an ended call must not mint a token) but return the clearer copy.
- No simulated states: every label still derives from a real `emergency_calls` row.

## Verification

- Activate SOS with a multi-member Safety Network and confirm several rows go to `ringing` at once instead of instantly `ended`.
- Confirm a second and third round start ~20s apart while nobody answers.
- Answer on a second device and confirm audio connects and the other rows end.
