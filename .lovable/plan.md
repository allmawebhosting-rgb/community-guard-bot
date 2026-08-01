# Premium chat area + context-aware suggestions

Two problems today: the six suggestion chips are a hard-coded list rendered under every assistant reply regardless of what is being discussed, and the chat area itself (bubbles, step cards, option buttons) still looks like a plain form. This fixes both.

## 1. Suggestions follow the conversation

- The assistant proposes its own follow-ups through a new `suggest_replies` tool (up to 4 short labels + the text each one sends). Chips render only from that tool's output for the latest assistant message.
- During a guided flow (for example "Step 1 of 8 — Are you in a safe place?"), the chips are the answers to that question, not "Find hospital / Generate report". The structured-question card already carries its own options, so when it is present the generic chip row is suppressed entirely — no duplicate answer sets.
- Fallback when the model returns no suggestions: a small context-derived set inferred from the current flow (safety check → safe / in danger / not sure; evidence step → upload photo, skip; finished report → view report, share location), never the fixed six.
- The static `SUGGESTION_CHIPS` array is removed.
- Prompt rules added: always end a turn with 2-4 relevant suggestions that match the current step, never offer unrelated actions mid-flow, and only surface broad actions (find hospital, emergency numbers, generate report) once a flow completes or when idle.

## 2. Premium chat area

- **Messages** — assistant replies sit on the page with no bubble, refined typography and spacing; user messages get a solid high-contrast bubble with a soft shadow, entering with a subtle slide (user from right, assistant from left).
- **Step cards** — the "Step 1 of 8" card becomes a premium panel: gradient hairline border, glass surface, animated progress bar that fills on change, step counter as a pill.
- **Option buttons** — larger touch targets, gradient hover wash, leading index badge, spring press feedback, keyboard focus ring.
- **Suggestion chips** — glass pill with gradient hairline, staggered entry, press animation, horizontal scroll on mobile with edge fade instead of wrapping into a messy block.
- **Tool cards** (facilities, alerts, report receipt) get the same glass + gradient-hairline treatment for a consistent look; running tools keep the shimmer pill.
- **Transcript frame** — comfortable max width, softer scroll fade at top, and a scroll-to-latest button styled to match the composer.

Colors, radii and shadows all come from the existing Uganda-toned tokens; no new hard-coded colors.

## Technical notes

- `src/routes/api/chat.ts`: add `suggest_replies` tool (labels + prompts).
- `src/lib/allma-prompt.ts`: suggestion rules tied to the active flow step.
- `src/components/allma/allma-chat.tsx`: read suggestions from the last assistant message's tool parts, drop `SUGGESTION_CHIPS`, restyle message/step/option/tool components.
- `src/styles.css`: add gradient-hairline and chip-scroll utilities alongside the existing composer ring.

Composer border work from the previous pass stays as-is.
