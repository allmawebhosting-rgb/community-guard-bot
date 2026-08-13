# Switch relay connectivity to Metered, with a shared-secret TURN path

Calls today fall back to public STUN, which cannot cross carrier-grade NAT on most Ugandan mobile networks. This replaces Cloudflare as the relay provider with Metered (Open Relay) and adds a standards-based shared-secret path so any TURN server — including a self-hosted coturn — works without code changes.

## What changes for you

- Emergency and safety-network calls connect through a real relay in production, so they stop failing on mobile data.
- The call screen keeps its honest indicator: "Relay active" only when a relay credential was genuinely issued, otherwise "Direct connection only".
- Nothing about who may call whom changes; permissions, blocks and SOS authorization stay exactly as they are.

## Relay selection order

The server picks the first option that is configured, so you can start with Metered and move to your own server later without another code change.

```text
1. Metered              METERED_API_KEY  (+ optional METERED_APP_NAME)
2. Shared-secret TURN   TURN_URLS + TURN_SHARED_SECRET   (coturn use-auth-secret, Xirsys, etc.)
3. No relay             public STUN only, UI says so
```

## Secrets to add

- `METERED_API_KEY` — from the Metered dashboard (Open Relay / TURN product).
- `METERED_APP_NAME` — optional; only if your Metered subdomain is not the default.
- `TURN_URLS` + `TURN_SHARED_SECRET` — only if you also run your own coturn.

I will request these through the secure secret form after the plan is approved. The existing `CLOUDFLARE_TURN_KEY_ID` / `CLOUDFLARE_TURN_API_TOKEN` secrets are unused after this and can be deleted; I will leave them in place unless you say otherwise.

## Technical details

`src/lib/turn.functions.ts` — keep the current shape (auth middleware, call-participant check, `IceConfig` return with `relay` and `reason`) and replace only the provider block:

- Add a `provider` field to `IceConfig` (`"metered" | "shared_secret" | "none"`) for diagnostics; `relay` stays the single source of truth for UI copy.
- Metered: `GET https://{app}.metered.live/api/v1/turn/credentials?apiKey=...` inside the handler, normalise the response into `iceServers`, keep the existing check that at least one `turn:`/`turns:` URL came back before reporting `relay: true`.
- Shared secret: derive `username = <unix expiry>:<callId>` and `credential = base64(HMAC-SHA1(secret, username))` using Web Crypto (`crypto.subtle`), which works in the Cloudflare Worker runtime. TTL stays 600s, so a leaked credential is worthless.
- Keep the existing behaviour on provider failure: return public STUN with `reason: "provider_error"` rather than throwing, so a relay outage degrades the call instead of blocking it.
- Never log the API key, shared secret, or issued credential.

`src/lib/voice-call.ts` and `src/components/allma/calls/call-center.tsx` — no logic change; they already consume `relay` and retry once with fresh credentials on ICE failure.

## Verification

- Typecheck.
- Call the ICE endpoint as a signed-in participant and confirm the response contains `turn:`/`turns:` URLs and `relay: true`; confirm a non-participant is still rejected.
- Confirm that with no relay secrets set the response is still public STUN with `relay: false`, and the call screen shows the honest "Direct connection only" warning.
- Relay traversal on a real Ugandan mobile network can only be confirmed on your device; I will tell you what to check rather than claim it works.
