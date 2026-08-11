# Save onboarding to the database and require it for every sign-up

Today the onboarding flow (profile, location preference, emergency circle, safety plan) is stored only in the browser's local storage, so it is lost on another device and never reaches the backend. Google sign-up also skips onboarding entirely and lands straight on the dashboard.

## What changes

1. **Onboarding is saved to your account**
   - Name, phone, language, avatar and location-sharing preference are saved to your profile.
   - Trusted contacts added in the Circle step are saved as real emergency contacts.
   - The safety plan toggles are saved as your preferences.
   - Returning on a new device resumes/skips correctly based on the account, not the browser.

2. **Everyone goes through onboarding once**
   - After email sign-up, Google sign-in, or any first sign-in where onboarding is not yet complete, the user is sent to `/onboarding` instead of the dashboard.
   - Once completed, sign-in goes straight to the intended destination as before.
   - A user who was mid-flow resumes at the step they left.

## Technical details

**Database migration** (one migration, approval required):
- Add to `public.profiles`: `onboarding_completed boolean not null default false`, `onboarding_step smallint not null default 0`, `location_mode text not null default 'approximate'`, `safety_plan jsonb not null default '{}'::jsonb`.
- Emergency circle rows reuse the existing `public.emergency_contacts` table (already has user-scoped RLS).
- No new tables, so no new grants; existing profile RLS (`auth.uid() = id`) already covers reads/writes.

**App changes**
- `src/routes/onboarding.tsx`: on mount, load profile + emergency contacts for the signed-in user and hydrate the draft from the DB (local storage kept only as a pre-auth fallback). Persist step progress on each Next, write contacts on add/remove, and on Finish set `onboarding_completed = true` before navigating to `/chat`.
- Unauthenticated visitors can still preview onboarding; the Finish action redirects to `/auth?next=/onboarding` and then saves.
- `src/routes/auth.tsx`: replace `goNext()`'s unconditional dashboard redirect with a check of `profiles.onboarding_completed` (after password sign-in, after Google returns, and in the existing-session effect); route to `/onboarding` when false. Google's `redirect_uri` stays `window.location.origin` and the check runs after the session hydrates.
- `src/routes/_authenticated/route.tsx` stays the auth gate only; the onboarding redirect lives in a small shared helper (`src/lib/onboarding.ts`) used by the auth page and the dashboard/chat entry so a Google user who lands directly on a protected route is still sent to onboarding.
- Police officer onboarding (`officer_profiles`) is untouched.
