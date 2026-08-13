# Keep the assistant on topic (lost & found turn)

In your transcript three things went wrong on a single turn:

1. It greeted and introduced itself even though your first message was a concrete request ("I want to report something lost or found").
2. It asked "did you lose an item or find someone else's?" as loose prose instead of the first step of the Lost & found flow, so no answer chips were generated.
3. Because no step and no suggestions existed for that turn, the chip row fell back to the broad idle menu — Report a crime / Find help nearby / Emergency numbers — which is exactly the "it's everywhere" feeling.

The prompt already forbids 1 and requires suggestions on every turn, but nothing enforces it, and the client's last-resort fallback is an off-topic menu.

## What changes

**Chips never go off-topic**
- Remove the idle-menu fallback for any turn that follows a user message with an intent. When the assistant asks a question and gives no options, chips are derived from the question itself (lost vs found, item type, when, where, photo) instead of the generic menu.
- The idle menu appears only on a truly empty conversation, never after the assistant has asked something.
- If a question can't be matched to answers, show no chips rather than unrelated ones — the composer stays available.

**The assistant must open a flow when you name one**
- When a message names an intent (lost/found, missing person, crime, SOS, find help), the first reply must open that flow with a step question (step 1 of N) — not a prose question.
- Lost & found gets an explicit first step with fixed answers: "I lost something" / "I found something".
- Enforced server-side: if a reply asks a question but emits neither a step card nor suggestions, the turn is completed with topic-matched options derived from the active flow, so a bare prose question can no longer reach the screen.

**No greeting on a concrete first message**
- Strip a leading greeting/self-introduction from the reply when the user's message already contained a request, instead of only asking the model not to write one.

## Technical notes

- `src/components/allma/allma-chat.tsx`: `contextualChips` — drop `IDLE_CHIPS` as the post-question fallback (keep it for the empty state only); extend `STEP_FALLBACK_CHIPS` with a lost/found matcher; apply the fallback matcher to the assistant's prose question text, not just step-card questions.
- `src/routes/api/chat.ts`: after the model turn, if the text ends in a question with no `ask_structured_question` / `suggest_replies` part, append a synthesized `suggest_replies` output built from the derived flow state; strip a leading greeting sentence when the first user message carries an intent.
- `src/lib/allma-prompt.ts`: add the Lost & found opening step with its two fixed options, and state that a named intent must be answered with a step question rather than prose.
