# Restart Lovable Cloud backend and verify health

## Goal
Restart the Lovable Cloud database/backend and confirm it comes back healthy, then answer whether credits are required for the site to function.

## Steps

1. **Restart the backend**
   - Use the Lovable Cloud restart tool to restart the Supabase backend.
   - Wait for the backend to become available (may take a few minutes).

2. **Verify backend health**
   - Check `supabase--cloud_status` or `supabase--db_health` to confirm the backend is responding.
   - Optionally run a lightweight read query against a known table to confirm connectivity.

3. **Confirm site preview still loads**
   - Verify the dev preview at `http://localhost:8080` responds after the restart.

## Credits note

- The live preview and basic app navigation do **not** require credits.
- Credits are consumed by: AI chat turns, image/video generation, builds/migrations, and Lovable Cloud usage beyond the free monthly allowance (20 Cloud credits + 4 AI Gateway credits per month on every plan).
- Free plans get 5 daily credits, capped at 30 per month. Paid plans get a larger monthly pool.

## Out of scope

- No code changes.
- No migrations or data modifications.
- No secret or environment changes.
