# Make calls ring when the browser is closed

## What the data shows

- Only **1 device** is registered for background alerts across the whole app (`push_subscriptions`: 1 row, 1 user, last used 24 Aug). Everyone else has no subscription, so there is nothing to push to — a closed browser can never ring for them.
- **648 SOS calls** have been placed, but the emergency invitation table has **0 rows**. The push routine writes an invitation before it ever touches the VAPID keys, so zero rows means the routine returned or failed before that point on every single call. The most likely reason is the status guard at the top: it only pushes when the call row is still `initiating`/`ringing`/`connecting`, and SOS rows were being marked `ended` within milliseconds (the sibling-cancellation bug). Any other failure is swallowed by a silent `.catch()`.
- There is **no web app manifest** in the project (`public/` has only favicons/robots/sw.js) and no manifest link in the app head. Without an installable app, iPhone/iPad cannot deliver web push at all, and Android never offers "Install app".

So three independent things must change: people must actually be subscribed, the push must not be skipped, and the app must be installable.

## The fix

1. Ask for background alerts where people actually are
   - Move the opt-in out of the Profile page only: show a one-time, dismissible prompt on the SOS screen and the Calls screen for signed-in users whose device has no subscription yet.
   - Re-register silently on every app load when permission is already granted but the subscription row is missing or stale (this repairs devices whose subscription expired), and refresh `last_used_at`.
   - Keep the existing Profile card as the on/off control.

2. Make the app installable (required for iOS push)
   - Add a real web app manifest (name, short name, Uganda-palette theme/background colors, maskable icons, `display: standalone`, start URL `/`) and link it plus `apple-mobile-web-app-*` tags from the root head.
   - Keep the existing Add-to-Home-Screen guidance copy, which then becomes accurate.

3. Stop dropping the push
   - Send the alert for every dialed recipient, including each contact in an SOS round, not only the primary row.
   - Relax the status guard so a row that is merely being created/`ended`-raced still pushes, and stop swallowing errors: log the failure reason server-side and surface a non-blocking indication to the caller when zero devices were reached.
   - Record the outcome per recipient in the invitation row as today (`SENT` -> `DELIVERED`/`FAILED`) so delivery is auditable with real data.

4. Make the notification behave like a call
   - Service worker: keep the notification sticky, re-notify per round, and show "Answer"/"Dismiss"; tapping Answer focuses or opens `/calls` with the call and invitation ids as it does now.
   - Add a "Send test alert" action next to the Profile toggle so a user can prove their own device rings while the browser is closed.

## Honest limitation to state in the UI

Web push wakes a notification, not a full-screen native ringer. On iOS it only works after Add to Home Screen, and the OS may delay delivery. The copy will say this plainly rather than promise CallKit-style ringing.

## Technical notes

- New: `public/manifest.webmanifest` + icons; head links in `src/routes/__root.tsx`.
- `src/lib/push.ts`: add `ensurePushRegistered()` (silent repair when `Notification.permission === "granted"`), export a "needs opt-in" check for the prompt.
- New small component for the inline prompt, mounted on `src/routes/sos.tsx` and `src/routes/_authenticated/calls.tsx`; dismissal stored per device.
- `src/lib/push.functions.ts`: widen the status guard, `console.error` real reasons, add `sendTestPushAlert` (self-only, rate-limited).
- `src/components/allma/calls/call-center.tsx` / `src/lib/sos-escalation-controller.ts`: call `notifyIncomingCall` for every recipient dialed in a round.
- `public/sw.js`: answer/dismiss actions and per-round renotify.
- No schema change needed; `push_subscriptions` and `emergency_call_invitations` already exist with correct policies.

## Verification

- Enable alerts on a second device, close the browser completely, place a call, and confirm the notification appears and Answer opens the ringing call.
- Confirm `push_subscriptions` gains rows for each device and invitations move `SENT` -> `DELIVERED`.
- Confirm the manifest makes "Add to Home Screen" produce a standalone app that still receives the alert.
