---
name: Supabase CLI network
description: Network limitation encountered when checking linked Supabase migrations from this workspace.
---

The Supabase CLI can fail linked-project migration commands with an IPv6 connectivity error even when the project reference is configured locally. The CLI suggests relinking the project with its project reference so it uses an IPv4-compatible database connection.

**Why:** This workspace's network does not support the IPv6 path selected by the CLI.

**How to apply:** If a future task needs to inspect or apply linked Supabase migrations, try the CLI's suggested `supabase link --project-ref ...` path first; do not claim migrations were applied based only on local SQL files.