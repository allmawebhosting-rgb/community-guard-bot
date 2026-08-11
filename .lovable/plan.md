# Apply the four pending database updates

Four backend update files exist in the project but were never applied to the live database. Everything they define is currently missing, which is why the emergency-call, responder-network, authority and institutional screens fall back to empty or demo data.

## Already applied
- Police station seed data (12 stations present)
- Onboarding fields on profiles (completed, step, location mode, safety plan)

## Pending — to be applied, in order

1. **Emergency communication (Phase 3)**
   Emergency calls, call sessions, responder assignments, escalations, chat events and audit events. Unblocks the in-app voice/call endpoint that currently has no tables to read or write.

2. **Community responder network (Phase 4)**
   Community responders, their skills, live locations, notifications and responder-submitted reports.

3. **Authority coordination (Phase 5)**
   Authority directory, authority notifications and authority escalations. Replaces the demo-only authority list with real records.

4. **Institutional infrastructure (Phase 10)**
   Hierarchy nodes, organizations and their members, major incidents, system status and handover acceptance records.

## Technical details

- Each file is applied byte-for-byte through the migration tool as a separate migration, in timestamp order, since later files reference earlier tables.
- Every statement is `create ... if not exists`, so re-running is safe against the partially-populated schema.
- Each migration requires a separate approval from you; I'll run them one after another.
- After all four are applied I'll check the security linter output and fix any access-rule warnings that come from these new tables (grants and row-level policies), then confirm the app pages that query them (`authority`, `responder`, `national`, `calls`) resolve against real tables instead of the fallback paths.
- No app code changes are needed unless the linter or a page query surfaces a mismatch; nothing is deleted or overwritten.
