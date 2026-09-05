# Link your own Google Maps key so the maps stop falling back

You have the key, so the remaining work is linking it and verifying the maps.

## Steps

1. I open the Google Maps connection picker. You click **New connection**, then **Use your own credentials**, and paste the key there (not into chat). The existing Lovable-managed connection can stay — the new one lives alongside it.
2. Once linked, the browser key becomes available to the app automatically.
3. I verify in the live preview that:
   - the SOS location card shows a real Google map (Google controls and attribution), not open tiles,
   - the incoming emergency call screen map does the same,
   - no key/referrer rejection appears in the browser console.
4. If the key is still rejected, I read the exact rejection reason and tell you which setting to change in Google Cloud (usually a missing website pattern in the key's allowlist, or the Maps JavaScript API not enabled).

## Notes

- No changes to the map screens themselves are needed — they already prefer Google and only fall back when the key is refused.
- Your key's website allowlist should include `https://allmasafetyai.online/*`, `https://*.allmasafetyai.online/*`, `https://*.lovable.app/*`, and `https://*.lovableproject.com/*`.
