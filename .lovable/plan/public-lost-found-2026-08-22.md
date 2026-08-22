# Public Lost & Found

A new public page at `/lost-found` where anyone (no sign-in) can search items handed in to police, submit a claim on an item, or post something they lost so police can match it. Premium dark-glass design with the Uganda gradient accents used across the app.

## What the public sees

- Hero header: "Lost & Found", one-line explainer, live count of items available for claim.
- Search + filters: free-text search (item type / description), district filter, and category chips (Phone, Bag, Documents, Wallet, Keys, Other).
- Item grid of handed-in items: photo (or a typed icon tile when there's no photo), item type, safe description, district, date handed in, and a status pill (Available, Claim under review, Released).
- Safe-summary rule: serial numbers and ID numbers are masked (e.g. `••••951`). Exact hand-in address is reduced to district/area. This keeps the reference visible enough to recognise your own item without enabling false claims.
- Item detail sheet: full safe summary plus two actions — "This is mine — claim it" and "Share".
- Claim form (in the sheet): your name, phone, what proves it's yours (marks, contents, serial you remember). Submitting creates a claim that police review in the command centre; the item shows "Claim under review".
- "I lost something" form: item type, description, where/when, district, optional photo, contact name + phone. Posted as a public lost report awaiting police matching.
- Empty and loading states use shimmer skeletons, never blank.

## Nothing is faked

Every card, count and status comes from real database rows. No demo items are seeded; if the table is empty the page says so plainly. No claim is ever shown as approved unless police approve it.

## Police side

The existing `/police/persons` Lost & Found tab gains the incoming public data: pending claims per item (with the proof text and contact) and publicly posted lost items, with Approve / Reject on a claim and the existing Release to owner action. Approving a claim sets the item to released and records an audit entry.

## Technical notes

Database (one migration):
- `lost_found_items` currently has no Data API grants and only an officer policy, so it is unreachable from the client. Add `GRANT SELECT ON public.lost_found_items TO anon, authenticated` and a public SELECT policy limited to `kind = 'found'` rows, keeping the officer-manage policy for writes.
- New `lost_found_claims` table (item_id, claimant_name, claimant_phone, proof_text, status, created_at) with `GRANT INSERT TO anon, authenticated`, `GRANT SELECT/UPDATE TO authenticated` gated to verified officers, RLS enabled, an anon INSERT policy and an officer read/update policy. Public users cannot read claims (they contain other people's contact details).
- New `lost_found_public_reports` table for publicly posted lost items (item_type, description, location_text, district, occurred_on, photo_url, contact_name, contact_phone, status) with the same anon-insert / officer-read shape.
- No changes to existing SOS, reports, auth or safety-network tables.

Frontend:
- `src/routes/lost-found.tsx` — public route (outside `_authenticated`), wrapped in `AppShell`, with its own `head()` metadata (title, description, og/twitter tags).
- `src/components/allma/lost-found/` — `lost-found-grid.tsx`, `item-detail-sheet.tsx`, `claim-form.tsx`, `report-lost-form.tsx`, plus a `mask.ts` helper for identifier masking.
- Data reads via TanStack Query against the Supabase client; forms via mutations with `sonner` toasts.
- Styling uses existing semantic tokens (`premium-surface`, `glass`, `gold`, `primary`) — no new hardcoded colours. Motion for card stagger, sheet spring entrance, and pressed-button scale.
- Nav: add a Lost & Found entry alongside the existing public Alerts/Nearby links, and a quick-action chip on the chat welcome screen.
