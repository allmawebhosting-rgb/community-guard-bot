# Full-page premium "Post a lost item" experience

Right now the posting wizard renders as a card section inside the Lost & Found page, so it competes with the hero, search bar and item grid. It becomes its own full-screen experience instead.

## What changes for the user

- Tapping "Post a lost item" opens a full-screen posting flow that covers the entire viewport — no page chrome, no grid showing through, nothing to scroll past.
- A slim top bar: back/close control on the left, "Post a lost item" label centre, step counter (`02 / 05`) on the right.
- Directly under it, a full-width gradient progress bar (gold to primary-glow to primary) that springs to its new width on each advance.
- The step content sits centred in the viewport, one focused question set per screen, max width ~40rem on desktop and edge-to-edge on mobile: icon tile, eyebrow, heading, one-line helper, then the fields.
- On desktop the five step labels appear as a horizontal strip with dots for completed steps; on mobile only the counter and bar show.
- Actions live in a sticky bottom action bar pinned to the bottom of the screen (safe-area aware): Back on the left, Continue/Post on the right, Continue disabled until that step is valid.
- Ambient premium backdrop behind everything: dark gradient wash plus a soft signal-streak glow, blurred, non-distracting.
- On success the same full screen becomes a confirmation panel: animated check, "Posted for matching", what happens next, and a button that closes the flow and returns to browsing items.
- Escape key and the close control exit the flow; body scroll is locked while it is open.

## Steps (unchanged content)

1. The item — category chips + item name
2. Where & when — place, district, date
3. Details — description with character counter
4. Photo — dashed drop tile, optional and skippable
5. Your contact — name, phone with inline validation, privacy reassurance, review summary, submit

## Technical notes

- `src/routes/lost-found.tsx`: remove the inline `reporting` card section; instead render `<ReportLostForm />` inside a fixed full-screen overlay (`fixed inset-0 z-50`) mounted via `AnimatePresence`, with a fade + slight scale entrance and body scroll lock while open.
- `src/components/allma/lost-found/report-lost-form.tsx`: restructure the wizard shell into full-screen layout — sticky header (title, counter, progress bar), scrollable centred content region, sticky footer action bar. Field state, validation and the existing `useMutation` (photo upload to `lost-found-public`, then `submitPublicLostReport`) are untouched.
- Styling uses existing semantic tokens only (`gold`, `primary`, `primary-glow`, `premium-surface`, `shadow-lift`); no hardcoded colours.
- Motion for React for step cross-fade with directional x-offset, progress spring, chip/field stagger, button press scale; `prefers-reduced-motion` respected.
- No database, RLS, storage or validation changes.
