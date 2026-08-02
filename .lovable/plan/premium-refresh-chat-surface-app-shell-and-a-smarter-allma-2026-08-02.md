# Premium refresh: chat surface, app shell, and a smarter Allma

Two tracks: a noticeable visual refresh of the chat screen and app shell, and a real upgrade to how Allma reasons and talks.

## 1. Smarter, less robotic Allma

**Stronger model.** The chat route currently starts on `google/gemini-3.6-flash` and falls back through Gemini 2.5 Flash and GPT-5.6 Luna. Move the primary to `openai/gpt-5.6-sol` (reasoning effort `none`, as required for tool calls) and keep the Gemini models purely as failure fallbacks. Result: better inference, tighter instruction following, fewer scripted-sounding turns.

**Fewer, denser steps.** Today the prompt forces a rigid "one question at a time" march through 8–9 numbered steps, which is why replies read like a form. Change to:
- Extract every detail the user already gave, silently, and skip those steps entirely.
- Group naturally-paired details into one question ("Where and roughly when did this happen?") instead of two turns.
- Keep the hard one-question rule only for the safety check and for distressed users.
- Show progress as a soft signal ("Two more things and we're done") rather than "STEP 3 OF 8" on every turn; the step card is reserved for genuine multi-option choices.

**Less robotic wording.** Replace the templated acknowledgements with a variety rule: never open two consecutive turns with the same phrase, no "Got it —" on every reply, no restating the user's words verbatim every turn. Add short bad/good rewrites in the prompt so the model has concrete targets.

**Better reasoning and tool use.** Add an explicit reasoning checklist the model runs before each reply (danger? already known? draft to resume? matchable report? facility needed?) and make proactive tool use the default rather than something it waits to be asked for: `recall_history` and `get_draft` on the first turn of a returning user, `remember` the moment a durable fact appears, `match_reports` automatically after any lost/found report, `find_facilities` as soon as a location need surfaces.

## 2. Chat screen visual refresh

Same dark Uganda palette, new structure and rhythm.

- **Type scale.** Larger, more confident assistant text with proper measure (~68ch) and looser leading; smaller, quieter meta text. This alone removes most of the "generic chatbot" feel.
- **Transcript rhythm.** Wider vertical spacing between turns, tighter within a turn, subtle first-token fade for streamed text, and a refined thinking state that replaces the plain shimmer.
- **Step / question card.** Restructured: eyebrow progress row with a thin animated track, question in display type, options as full-width tappable rows with a leading marker and hover/press feedback — instead of the current stack of outlined buttons.
- **Tool cards** (facilities, alerts, reports, receipts, drafts, matches): one shared card shell with a gradient hairline, an icon chip in the corner, a clear title/meta hierarchy, and actions on a footer row. Consistent radius and border weight across all of them.
- **Suggestion chips.** Refined pill styling, staggered entrance, horizontal scroll with edge fade on mobile, clear pressed state.
- **User bubble.** Keep the gradient fill but tune padding, radius and max-width so it balances against the bubble-free assistant text.
- **Empty state.** Upgraded hero: mascot with a soft glow, greeting in display type, and a compact grid of primary actions instead of a loose chip row.

## 3. App shell, header, nav

- **Header:** slimmer, single hairline, brand lockup with a softly pulsing online dot, thread title truncated in the centre on desktop, actions grouped on the right.
- **Sidebar / thread list:** clearer active state (accent bar + raised surface), grouped by Today / This week / Earlier, hover-revealed row actions, refined "New conversation" button.
- **Mobile bottom nav:** larger touch targets, active icon with a lifted pill background and label weight change, safe-area padding.
- **Background:** slower, calmer mesh so it never competes with the transcript.
- **Transitions:** consistent 200–300ms fade/slide on route changes and sheet opens; all motion respects reduced-motion.

## Technical notes

- `src/routes/api/chat.ts`: reorder `CHAT_MODELS` with `openai/gpt-5.6-sol` first and pass `providerOptions: { lovable: { reasoningEffort: "none" } }` for the GPT path.
- `src/lib/allma-prompt.ts`: rewrite the flow, tone, progress and tool sections per above; flows become detail checklists rather than fixed numbered scripts.
- `src/components/allma/allma-chat.tsx`: restructure the step card, tool cards, chips, and empty state; no change to tool wiring or data flow.
- `src/components/allma/app-shell.tsx`, `app-header.tsx`, `thread-list.tsx`, `mesh-background.tsx`: shell, nav, and background refresh.
- `src/styles.css`: new type-scale and card/chip utilities; all values stay on existing semantic tokens — no hard-coded colours.

No database or schema changes.
