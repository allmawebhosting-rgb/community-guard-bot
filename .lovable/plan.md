# Production call reliability: TURN relay + web push for incoming calls

Two gaps that no amount of UI work can hide: calls only have public STUN today (`src/lib/voice-call.ts` ships two Google STUN URLs and nothing else), so two peers behind carrier-grade NAT never find a path; and incoming calls only ring while the app is open in the foreground.

## 1. TURN relay via Cloudflare

**Where credentials come from.** Cloudflare Calls issues short-lived TURN credentials from a server-side API call using a TURN key ID and API token. Those two values are stored as backend secrets — never in client code.

**New server endpoint.** A server function mints credentials on demand:
- Requires an authenticated caller.
- Requires the caller to be a participant of the call it is asked about, so the endpoint can't be used as a free relay by anyone with an account.
- Requests a credential with a short TTL (a few minutes — long enough to gather ICE, short enough that a leaked value is worthless).
- Returns the full ICE server list: Cloudflare STUN, `turn:` over UDP, and `turns:` over TCP/443 for networks that block UDP entirely.
- If Cloudflare is not configured or errors, it returns the public STUN list plus a flag saying relay is unavailable, so calls still work on friendly networks instead of failing outright.

**Client changes.** `VoiceCallEngine.start()` fetches ICE servers before creating the `RTCPeerConnection` instead of using the hardcoded constant. The existing `iceServers` plumbing in `src/routes/api/voice.ts` and `src/lib/voice-provider.ts` is fed from the same helper so both call paths behave identically.

**Honest UI.** The call screen shows relay state truthfully: "Relay active" when TURN credentials were issued, and a quiet "Direct connection only — may fail on some mobile networks" note when they weren't. No fake reassurance. On ICE failure the engine restarts ICE once with fresh credentials before reporting a failed call.

## 2. Incoming calls when the app is backgrounded

Web push, not CallKit — on the web there is no CallKit, and this will be stated plainly rather than implied.

- A service worker registers for push and displays a high-priority notification with Answer / Decline actions; tapping Answer focuses or opens the app on the call screen.
- Push subscriptions are stored per user and per device, with stale subscriptions removed when the push service reports them gone.
- Sending is triggered server-side when a call row is created, so the recipient is notified even with no tab open. VAPID keys are generated as backend secrets.
- iOS Safari only delivers web push to installed (Add to Home Screen) apps. The app will detect this and, on iOS in the browser, tell the user directly that background call alerts require installing Allma to the home screen — rather than silently not working.

## 3. What still won't be true after this

Recorded in the project docs so nobody assumes otherwise:
- No native CallKit / full-screen incoming-call UI. That needs a native iOS/Android wrapper.
- Push wake-up is best-effort: the OS may delay it, and a fully killed browser on some Androids may not deliver it.
- TURN bandwidth is metered — heavy call volume has a real cost.

## Technical notes

- `src/lib/turn.functions.ts` — authenticated server fn minting Cloudflare TURN credentials, reading `CLOUDFLARE_TURN_KEY_ID` / `CLOUDFLARE_TURN_API_TOKEN` inside the handler; participant check via the existing call tables.
- `src/lib/voice-call.ts` — replace the `ICE_SERVERS` constant with an async fetch + one ICE-restart retry; expose relay state through the existing engine events.
- `src/routes/api/voice.ts`, `src/lib/voice-provider.ts` — populate `iceServers` from the same source.
- `src/components/allma/calls/call-center.tsx` — relay status line, iOS install hint.
- New: `public/sw.js` push handler, `src/lib/push.ts` subscribe/unsubscribe, `src/lib/push.functions.ts` send path.
- Migration: `push_subscriptions` table (user_id, endpoint unique, keys, created_at) with GRANTs, RLS scoped to `auth.uid()`, and a trigger or server-side hook on new calls to fan out the push.
- Secrets to add: `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` (you provide, from the Cloudflare dashboard), plus auto-generated VAPID keys.
