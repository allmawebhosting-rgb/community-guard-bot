# Auto-activate SOS from the "Possible emergency" check

Right now, when you don't answer the safety check, Allma stops at the "Possible emergency detected" card and waits for you to tap "Activate SOS". Inactivity + no response scores as *medium* confidence, and both the app and the database only authorize automatic activation at *high* confidence — so nothing happens on its own.

## New behaviour

- When the safety check goes unanswered, the elevated card starts a final 10-second countdown: "Activating SOS in 10s — tap 'I'm safe' to cancel."
- If you don't cancel, Allma navigates itself to the live SOS screen (`/sos?instant=1&check=<id>`), which already captures location, records the activity with `activation_mode: smart_detection`, and alerts nearby responders.
- "I'm safe — cancel" cancels the countdown immediately and resolves the check as safe; nothing is sent.
- "Activate SOS" still works as an instant override.
- Respect the Privacy Center: if Smart detection or Automatic escalation is off, the card stays advisory-only exactly as today, with the existing "Automatic SOS is off for your account" note.
- The SOS screen keeps its "Activated automatically" banner with cancel, so an unwanted activation is one tap away from being closed.

## Technical notes

- Migration: `escalate_smart_sos_check` currently rejects anything below `high`. Loosen it to allow `medium` and `high` (still rejecting `low`), keep every other gate (auth ownership, `enabled`, `auto_escalation`) unchanged, and record the actual confidence rather than overwriting it with `'high'`.
- `src/hooks/useSmartSosDetection.ts`: on grace expiry, request escalation for `medium` and `high` (not just `high`). When the server allows it, enter a new `authorized` state with a 10-second countdown instead of calling `onEscalate` right away; fire `onEscalate` when the countdown hits zero unless `confirmSafe` ran. Log `auto_sos_countdown_started` and `auto_sos_activated` to the check audit trail.
- `src/components/allma/sos/smart-safety-check.tsx`: on the elevated state, show the countdown bar and the "Activating SOS in Ns" line when activation is authorized; button labels stay as they are.
- No change to the SOS experience, responder or calling code — the detection layer still only hands off to the existing SOS system.
