# Allma Safety AI

An AI-powered community safety platform built with a conversational assistant at its core. Users interact through natural language to file incident reports, find emergency services, and stay safe.

## Stack

- **React 19** + **TypeScript** + **TanStack Start** (SSR, file-based routing)
- **Tailwind CSS v4** with Space Grotesk / DM Sans fonts
- **Supabase** — auth + PostgreSQL database
- **AI SDK** (`@ai-sdk/react`) for streaming chat, connected to `/api/chat`
- **Vite** dev server (port 5000)

## Running locally on Replit

```
npm run dev
```

The dev server starts on **port 5000** (`0.0.0.0:5000`) and is configured as the "Start application" workflow.

## Key environment variables

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public key |
| `SESSION_SECRET` | Session signing secret |
| OpenAI / AI key | Set in Supabase Edge Function or server route for `/api/chat` |

## Project structure

```
src/
  routes/           # File-based TanStack Router pages
    index.tsx       # Homepage → guest AllmaChat
    onboarding.tsx  # Resumable trusted Emergency Circle setup
    _authenticated/ # Protected pages (chat, dashboard)
    api/chat.ts     # AI chat server route
  components/
    allma/          # Core: AllmaChat, QuickActionGrid, AppHeader, SosButton
    ai-elements/    # Reusable: Message, PromptInput, Conversation, Shimmer
    ui/             # shadcn/ui primitives
  lib/
    allma.ts        # QUICK_ACTIONS, emergency numbers, constants
    threads.ts      # Supabase thread queries
  integrations/supabase/ # Supabase client + auth
supabase/
  migrations/       # DB schema migrations
```

## Design system

- OKLCH colour tokens (signal-blue primary, destructive red for urgency)
- Custom utilities: `glass`, `hero-glow`, `brand-gradient-text`, `shadow-soft`, `rise-in`, `gradient-shift`
- Dark / light mode via `ThemeProvider`

## User preferences

- Keep existing project structure and stack; do not restructure or migrate.
- UI should be premium, mobile-first, and professional with animations and gradients.

## Onboarding

- Visit `/onboarding` to prepare a profile, location preference, trusted Emergency Circle and emergency plan.
- Progress is autosaved in the browser as `allma-onboarding-draft` so interrupted setup can resume.
- Location sharing requires explicit browser permission and is never presented as continuously shared.
- Trusted people remain invitation-pending until they accept; this flow does not invent production connections or responder integrations.

## Phase 2 emergency SOS

- The floating SOS control opens emergency mode with one tap at `/sos?instant=true`.
- Active SOS keeps a generated emergency ID visible, requests real browser geolocation, shows found/approximate/denied/unavailable states, and watches for live position updates while the session is active.
- Allma triage asks one question at a time with text, microphone transcription where supported, quick danger responses, and silent mode. It never claims an authority or responder was contacted automatically.
- Closing an active emergency requires confirmation. Official calls still use the device dialer and require the user's tap.
- Community responder visibility remains consent-based and approximate; exact coordinates are not shown to ordinary responders.

## Phase 3 emergency communication

- `/calls` is the authenticated emergency communication workspace for the citizen and responder views.
- The Phase 3 UI supports incoming emergency calls, explicit accept/decline, connected-call controls, secure emergency chat labels, responder status updates, escalation queue visibility, and an audit-style timeline.
- Voice is explicitly separated behind `src/lib/voice-provider.ts`. Until authenticated WebRTC signaling, STUN/TURN credentials, and a provider are configured, the app uses **DEMO CALL MODE** and never claims a real call occurred.
- `src/lib/emergency-communication.ts` contains the consent/eligibility ranking boundary: only opted-in, permissioned, available, unblocked responders with fresh location are eligible.
- `supabase/migrations/20260810120000_phase3_emergency_communication.sql` adds calls, call sessions, responder assignments, escalation events, emergency chat events and audit records with participant-scoped RLS.
