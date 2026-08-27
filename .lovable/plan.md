# Fix iPhone background alerts for SOS calls and activity

## What is actually broken

Verified against the live database:

- Two iPhones (iOS 18.7) **are** registered for background alerts, plus three other devices — so installing to the home screen and the permission prompt are working.
- The `emergency_call_invitations` table has **0 rows, ever**. Every SOS call push goes through that table first, so no background alert has ever been sent for a call.
- Root cause: the person who activates SOS is allowed to *create* an invitation row but has **no permission to read it back**. The app creates the row and immediately reads it to confirm; that read is blocked, the whole step fails, and the push is abandoned silently. Only the recipient can currently read invitations.
- Separately, SOS activity (the "X activated SOS" alert that lands in the in-app bell) creates an in-app notification row only — there is no background push for it at all, so a closed iPhone shows nothing.

## Changes

### 1. Database: let the SOS caller read their own invitation

Add a read rule on emergency call invitations for the person who placed the call (mirroring the update rule that already exists). This unblocks the confirm-and-send step, so pushes actually go out to the recipient's iPhone.

### 2. Push background alerts for SOS activity, not just calls

When SOS is activated, each safety-network member who gets the in-app alert also gets a background push (title: "<Name> activated SOS", body with the area when location was shared, link to their alerts/calls screen). This reuses the same delivery code path as call pushes, with a distinct notification tag so it does not replace an incoming-call banner.

### 3. Make failures visible instead of silent

Today a failed push is swallowed. After the fix, a failed background alert is logged server-side with the reason and surfaced to the SOS user as a plain sentence ("Background alert could not reach Jane's phone"), so a real delivery problem is never mistaken for success.

## Technical notes

- Migration: `CREATE POLICY "SOS callers view own invitations" ON public.emergency_call_invitations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.emergency_calls c WHERE c.id = call_session_id AND c.caller_id = auth.uid()))`. Grants are already correct (verified with `has_table_privilege`).
- `src/lib/push.functions.ts`: add a `notifySosActivity` server function that fans out to each safety-network member's `push_subscriptions` rows using the existing `@block65/webcrypto-web-push` payload builder and prunes 404/410 endpoints.
- SOS activation path (`src/lib/sos-escalation-controller.ts` / `sos-experience.tsx`) calls `notifySosActivity` once per activation, best-effort.
- `public/sw.js`: handle `type: "sos_activity"` with its own tag and an "Open" action; keep the existing call answer/dismiss behaviour untouched.
- No change to the ZEGOCLOUD call engine, ring timeouts, or the escalation order.

## Verification

- Re-query `emergency_call_invitations` after a test SOS: rows should appear with status `DELIVERED`.
- Server logs should show delivery counts per device instead of nothing.
