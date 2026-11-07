# Allma Safety AI

A community safety AI assistant built with React, TypeScript, Tailwind CSS, TanStack Router/Start, Supabase, and OpenAI.

## Stack
- **Runtime**: Node.js 22
- **Frontend**: React 19, TypeScript, Tailwind CSS v4
- **Router/SSR**: TanStack Router + TanStack Start
- **Backend/DB**: Supabase (auth + database)
- **AI**: OpenAI via Vercel AI SDK
- **Build**: Vite 8, Nitro

## How to run
```sh
npm install
npm run dev   # starts on port 5000
```

## Environment variables
Already configured in `.env`:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase publishable key
- `VITE_SUPABASE_PROJECT_ID` — Supabase project ID

AI features (chat, incident reporting) require an OpenAI-compatible API key if not already set.

Cloudflare Worker deployments must provide `GOOGLE_MAPS_API_KEY` as a Wrangler secret; do not
commit Google API keys in source or `wrangler.jsonc`. Account deletion is not operational and must
remain unavailable until the isolated staging tests and rollout approval are complete.

## User preferences
- Keep existing project structure and stack (TanStack Start + Supabase + Lovable conventions).
