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
