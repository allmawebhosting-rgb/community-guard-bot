# Finish linking your own Google Maps key

Your own key is saved in the workspace ("allma's Google Maps Platform"), but it is **not attached to this project yet** — the project is still using the Lovable-managed key, which is why the maps still fall back to open tiles.

## Steps

1. I reopen the Google Maps connection picker. This time pick the existing **allma's Google Maps Platform** entry (no need to re-enter the key) so it gets attached to this project.
2. The app then uses your key automatically for the browser maps.
3. I verify in the live preview:
   - the SOS location card shows a real Google map (Google controls and attribution) instead of open tiles,
   - the incoming emergency call map does the same,
   - no key or referrer rejection in the browser console.
4. If your key is still refused, I read the exact reason and tell you the one setting to change in Google Cloud (usually a missing website pattern in the key's allowlist, or Maps JavaScript API not enabled on the project).

## Notes

- No map screen code changes needed; they already prefer Google and only fall back when a key is refused.
- Your key's website allowlist should include `https://allmasafetyai.online/*`, `https://*.allmasafetyai.online/*`, `https://*.lovable.app/*`, and `https://*.lovableproject.com/*`.
