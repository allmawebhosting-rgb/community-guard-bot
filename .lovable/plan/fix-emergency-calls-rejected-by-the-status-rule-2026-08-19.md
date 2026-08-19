# Fix: emergency calls rejected by the status rule

Starting any call fails with `new row for relation "emergency_calls" violates check constraint "emergency_calls_status_check"`.

## What's actually wrong

The database rule on `emergency_calls.status` only allows: `pending, calling, ringing, accepted, declined, no_answer, busy, connected, failed, ended`.

But the calling code and the call functions use three values that aren't in that list:

- `initiating` — written by `start_voice_call` and `start_sos_emergency_call` when a call row is created, which is exactly the insert that fails.
- `connecting` — set when the recipient answers.
- `missed` — set when the caller gives up before an answer.

So the rule is out of date relative to the calling flow; nothing about the app logic is wrong.

## The fix

One migration that replaces the status rule with the full set of statuses actually used:

```text
pending, initiating, calling, ringing, accepted, connecting,
connected, declined, no_answer, busy, missed, failed, ended
```

Everything else stays as-is:
- The safeguard that a call can only be marked `connected` on a confirmed real WebRTC session is untouched, so no call can display as connected without a real provider session.
- The `provider_mode` rule (`demo`/`webrtc`) is untouched.
- No app code changes are needed; `src/lib/zego-call.ts` and `src/lib/sos-calling.ts` already model these statuses.

Afterwards, verify by starting a member-to-member call and an SOS call and confirming a row is created and the status moves ringing → connecting → connected.
