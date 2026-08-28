# Lost & Found posting — onboarding-style premium wizard

Turn the single long "Post my lost item" form into a guided, multi-step flow that matches the onboarding experience, with the same premium gradient styling and motion. Presentation only — the submission logic, storage upload and database writes stay exactly as they are.

## The new posting flow

Five steps, one focused question set per screen, with an onboarding-style header above the card:

1. **The item** — what you lost, category chips (Phone, Bag, Documents, Wallet, Keys, Other), free-text item name.
2. **Where & when** — place description, district, date lost.
3. **Details** — description textarea (colour, marks, contents, serial you remember) with a live character counter.
4. **Photo** — large dashed drop tile, tap-to-upload, preview with remove; clearly optional and skippable.
5. **Your contact** — name and phone with inline validation, plus the "only verified officers see this" reassurance, then a review summary and the submit button.

Shared chrome, copied from the onboarding pattern:

- Step counter (`02 / 05`) and a gradient progress bar (gold → primary-glow → primary) that animates on advance.
- Desktop step-label strip with dots for completed steps.
- Icon tile + eyebrow label + heading + one-line helper at the top of each step.
- Back / Continue pair at the bottom; Continue disabled until that step's required fields are valid (item name on step 1, name + valid phone on step 5). Steps 2–4 are all skippable.
- Success state becomes a full confirmation panel: animated check, "Posted for matching", what happens next, and a button back to browsing items.

## Design and animation

- Card surface: `premium-surface` / `bg-card/65` with hairline border, 2rem radius, backdrop blur and soft lift shadow — same as onboarding cards.
- Gradient accents from existing tokens only (gold, primary, primary-glow); no hardcoded colours. Subtle `signal-streak` glow behind the wizard.
- Motion for React: step content cross-fades with a small x-offset in the advance direction, progress bar width springs, category chips and fields stagger in, buttons scale on press. `prefers-reduced-motion` respected.
- Mobile-first: full-width single column, 44px+ touch targets, no zoom on input focus, sticky footer action row on small screens.

## Technical notes

- Rewrite `src/components/allma/lost-found/report-lost-form.tsx` as a stepped wizard: one `step` state, existing field state and the existing `useMutation` (photo upload to `lost-found-public`, then `submitPublicLostReport`) untouched.
- Extract small local pieces in that file: `WizardHeader`, `StepShell`, `Field`, `CategoryChips`, `PhotoStep`, `ReviewSummary`.
- `src/routes/lost-found.tsx` keeps rendering `<ReportLostForm onDone={...} />`; only the container padding/width is adjusted so the wizard has room.
- No database, RLS, storage or validation-rule changes.
