# Fix database problems with calls

## What the call data actually shows

I inspected the live call rows, constraints, policies, grants and realtime settings.

- Nothing is currently rejected by the database: grants and policies on `emergency_calls`, `call_signals`, `call_sessions` are correct, the status and provider rules already allow every status the app writes, and there are no stuck-open call rows.
- The dominant real failure is **not** the database: 29 of the last 33 calls ended as `failed` with the reason "Microphone access is required for an Allma voice call.", 2-3 seconds after being created, all from the same caller. The caller's browser never got microphone permission, so every SOS attempt died instantly.
- Because each of those instant failures counts as a real attempt, the SOS dialer raced through the whole safety network in about 90 seconds and would then hit the server's "Too many call attempts" cap (30 per 10 minutes), which stops escalation with a hard error.
- `call_sessions` and `call_signals` have zero rows — they belong to the older WebRTC path and are dead weight in the ZEGOCLOUD flow.
- `safety_activity` (the SOS session row) is not in the realtime publication and has REPLICA IDENTITY DEFAULT, so SOS state changes are not streamed to participants the way call rows are.

## Database changes

1. **Record why a call failed, not just that it failed.**
   Add a failure scope to `emergency_calls` (`caller_device`, `recipient`, `network`, `provider`) written by `update_voice_call`. A caller-side device failure (mic denied, no audio device) is stored as such instead of looking like the contact didn't answer.

2. **Stop caller-device failures from consuming the safety network.**
   Rate limiting and attempt counting in `start_sos_emergency_call` will only count attempts that actually reached the recipient (a `ringing_at` or later). A caller-side device failure no longer burns the contact or the quota, so the same contact can be retried once the microphone is granted.

3. **Make the rate limit fail soft.**
   Instead of raising "Too many call attempts" (which kills the escalation loop), the function returns a throttled result the UI can show honestly, and the cap is measured per contact per window rather than as one global counter.

4. **Align allowed statuses with what the app can set.**
   `busy` and `no_answer` are allowed by the table rule but rejected by `update_voice_call`; the function will accept them from the recipient side so "line busy" is a real, recordable state. Unused `pending`/`calling`/`accepted` values stay allowed for existing rows.

5. **Clean up stale call rows on both sides.**
   When a new SOS call starts, end the caller's stale rows (already done) *and* any of the recipient's inbound rows left non-terminal for more than a few minutes, so an old ringing row can't block a new emergency call.

6. **Stream SOS session state.**
   Add `safety_activity` to the realtime publication with REPLICA IDENTITY FULL, matching `emergency_calls`, so participants see SOS state changes live without polling.

7. **Retire the dead WebRTC signalling tables.**
   `call_sessions` and `call_signals` are empty and unused by the ZEGOCLOUD path. They will be dropped so the schema no longer implies a second signalling route. (Say the word if you'd rather keep them for a future fallback and I'll leave them untouched.)

## Also needed outside the database

The microphone permission failure is a browser/device issue, not a schema one. Once the changes above land, the SOS screen will show "Microphone blocked — allow access to call" and prompt for permission before dialing, rather than silently failing through the contact list. This is a small frontend follow-up in the call center and escalation card.

## Technical notes

- One migration: add `failure_scope` to `emergency_calls`; replace `update_voice_call`, `start_sos_emergency_call`; publication and replica-identity change for `safety_activity`; drop `call_sessions`, `call_signals`.
- No change to who may see or place a call: participant-only reads, both-sided call permission, block checks and SOS ownership checks are all preserved.
- No simulated states — every status shown still comes from a real row.
