# Show real Google Maps everywhere (SOS + incoming call)

## What's in place today

The app already prefers Google Maps and only falls back to open tiles when the key fails:

- `src/lib/google-maps-loader.ts` loads the Maps JavaScript API with the browser key and listens for `gm_authFailure`.
- `src/components/allma/live-location-map.tsx` renders the Google canvas when a key exists and no auth failure was seen, otherwise the OpenStreetMap tiles. The SOS screen and the incoming-call overlay both use this one component.
- The Google Maps Platform connection is already linked to this project, and the browser key + tracking ID are present in the environment.

So no code is missing a key — the maps are falling back because the key in use is being rejected in the browser.

## Why it falls back on both the preview and the custom domain

The linked connection is the Lovable-managed Google Maps key. That key is referrer-restricted and its allowlist is not editable. It cannot authorise `allmasafetyai.online` or `www.allmasafetyai.online`, and if the managed key is rejected for the Maps JavaScript API it also fails on the preview domain — which matches what you see: open tiles in both places.

The fix is to link your own Google Maps API key, whose referrer allowlist you control and which you can restrict to exactly the APIs this app uses.

## Steps

### 1. You create the key in Google Cloud

I'll walk you through this and answer questions as we go. You need four things:

1. A Google Cloud project with billing enabled (Maps requires billing even for free-tier usage).
2. These APIs enabled on that project: Maps JavaScript API (the SOS/call maps) and Places API (New) (nearby hospitals and police stations).
3. An API key created in that project.
4. The key's HTTP referrer allowlist set to include all of:
   - `https://allmasafetyai.online/*`
   - `https://*.allmasafetyai.online/*`
   - `https://*.lovable.app/*`
   - `https://*.lovableproject.com/*`

### 2. I link the key

Once you have the key in hand, I open the connector picker; you choose "New connection", then "Use your own credentials", and paste the key. The managed connection can stay — the new one lives alongside it.

### 3. Verify

After linking, I check in the live preview that:

- the SOS location card renders a Google Maps canvas (Google controls/attribution) and no OpenStreetMap tiles,
- the incoming-call overlay map does the same,
- no `RefererNotAllowedMapError` or `gm_authFailure` appears in the console.

## Technical notes

- No changes to map components are needed for this. The only possible code touch is making the fallback reason visible in the console for diagnosis if the new key still fails; map layout, zoom controls, accuracy ring, and the OSM fallback path all stay as they are.
- If your own key must also power server-side Places lookups without the gateway, its application restriction has to be "None" or "IP addresses" — referrer-restricted keys are rejected for server calls. Nearby help already goes through the gateway, so this is only relevant if you later want direct server calls.
