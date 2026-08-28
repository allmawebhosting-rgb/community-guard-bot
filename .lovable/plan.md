# Stop typing zoom + a lost-or-found choice that connects to Allma

Two changes: mobile pages stop zooming when a field is focused, and the Lost & Found posting flow starts by asking whether the person lost or found something — with Allma in chat handing off to the right one.

## 1. No zoom when typing

Mobile Safari zooms whenever a focused field renders below 16px. The global rule for this already exists, but component classes like `text-[15px]`, `text-[14px]` and `text-sm` on inputs, textareas and selects override it — including the Lost & Found search box, the district select, and every field in the posting wizard.

- Raise every form-control font size to 16px or more across the Lost & Found page, the posting wizard, and the claim sheet (visual size stays essentially the same; only the sub-16px fields change).
- Harden the global base rule so any input/textarea/select still keeps a 16px minimum even if a utility class sets something smaller.
- Nothing changes for desktop layout; labels and helper text keep their current small sizes (they're not focusable, so they don't trigger zoom).

## 2. "Did you lose it or find it?" as the first step

The posting flow currently assumes the item was lost. It becomes:

- Opening the full-screen posting flow shows a first screen with two large premium choice cards: **I lost something** and **I found something**, each with an icon, one-line description, and gradient hover/press motion.
- Choosing one sets the report kind and moves into the existing five-step wizard, with the copy adapted:
  - Lost: "What did you lose?", "Where did you lose it?", "Date lost".
  - Found: "What did you find?", "Where did you find it?", "Date found", and the contact step reads "so the owner can be reunited with it".
- The step counter becomes `01 / 06` … `06 / 06`, and Back from step 1 returns to the choice screen.
- The submitted report is stored with its kind so officers can match lost reports against found reports.
- Success panel copy differs per kind: lost → "Posted for matching"; found → "Thank you — this is now with the property desk".

## 3. Allma hands off to the right flow

- The chat's Lost & Found starting point stops trying to collect the whole report in conversation and instead offers the same two options; picking one opens the Lost & Found page directly in the matching posting flow.
- The page reads that intent from the link, so it lands on the wizard already set to lost or found instead of the choice screen.
- The two "Post a lost item" buttons on the page become one "Post an item" button that opens the choice screen.

## Technical notes

- Migration: add `kind text not null default 'lost' check (kind in ('lost','found'))` to `lost_found_public_reports`; existing rows stay `lost`. No new table, so no new grants; existing insert policy and RLS unchanged. Types regenerate.
- `src/lib/lost-found.ts`: `submitPublicLostReport` gains a `kind` field.
- `src/components/allma/lost-found/report-lost-form.tsx`: add a `kind` state plus an intro choice screen, kind-aware step copy, and accept an optional `initialKind` prop; validation and the existing photo-upload mutation stay as they are.
- `src/routes/lost-found.tsx`: single "Post an item" CTA, and read `?post=lost|found` search params to pre-select the kind when arriving from chat.
- `src/components/allma/allma-chat.tsx`: the Lost & Found quick action and its suggestion options link to `/lost-found?post=lost` and `?post=found`.
- `src/styles.css`: strengthen the 16px minimum for form controls.
