# Verify VAPID push keys end-to-end

The three VAPID values (public key, private key, subject) are already saved as backend secrets and wired into background call alerts. What's missing is a way to confirm they actually work — today the only signal is "enabled", which just means the browser accepted a subscription, not that a push was delivered with your keys.

## What to add

**1. A key validation check (server side)**
A new server function that inspects the saved VAPID values and reports precisely what's wrong when something is off:
- all three present or which one is missing
- public key is valid base64url and decodes to a 65-byte P-256 point
- private key decodes to a 32-byte scalar
- subject is a valid `mailto:` or `https:` value
- the pair mathematically matches (private key derives the same public key)

It returns a status plus a plain-English reason — never the key values themselves.

**2. A "Send test alert" button**
In the Background call alerts card on the profile page, next to the enable control: sends a real web push to the signed-in user's own registered devices using the saved keys, and reports the outcome per device — delivered, expired subscription (auto-removed), or the exact push-service error status. This is the only way to prove the keys are correct end to end.

**3. Clearer status in the card**
The card shows the validation result above the enable button: keys valid / a specific problem / not configured. If the keys are invalid, the enable button explains that instead of silently failing.

## Technical notes

- New `src/lib/push-health.server.ts` (validation logic, uses WebCrypto to check the key pair) and expose it through the existing `src/lib/push.functions.ts` as two authenticated server functions: `checkPushConfig` and `sendTestPush`.
- `sendTestPush` reuses `@block65/webcrypto-web-push` and the same delivery/stale-cleanup path as `notifyIncomingCall`, but only ever targets `auth.uid()`'s own subscriptions — no way to push to another user.
- UI changes live in `src/components/allma/calls/background-call-alerts.tsx`.
- No secret values are ever returned to the browser or logged.

## If you actually wanted to replace the keys

Say so and I'll open the secure form for `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`. Note that changing the public key invalidates every existing device subscription — each device must re-enable alerts.
