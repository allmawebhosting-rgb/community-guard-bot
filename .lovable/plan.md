# Keep the assistant on topic — every flow, not just Lost & found

Your transcript shows three problems that repeat on any topic:

1. It greets and introduces itself even when your first message is already a concrete request.
2. It asks its question as loose prose instead of as a real step of the flow, so no answer options are produced.
3. With no step and no suggestions for that turn, the chip row falls back to the broad idle menu — Report a crime / Find help nearby / Emergency numbers — which is what makes it feel "everywhere".

The prompt already forbids 1 and asks for suggestions every turn, but nothing enforces it, and the client's last-resort chips are an off-topic menu.

## What changes (applies to all topics)

**Chips never go off-topic, in any flow**
- The idle menu is used only for a brand-new empty conversation. It is never used after the assistant has asked something.
- When the assistant asks a question and gives no options, chips are derived from the question itself — safety, lost vs found, missing-person details, item/vehicle details, when, where, photo/evidence, contact details, confirm/submit.
- If a question genuinely can't be matched to answers, show no chips instead of unrelated ones; the composer stays available.

**A named intent always opens a guided flow**
- Any recognised intent — crime, theft, assault, missing person, lost & found, suspicious activity, SOS/emergency, find help nearby — must be answered with the flow's first step question (step 1 of N), not prose.
- Each flow gets an explicit opening step with fixed short answers, e.g. Lost & found → "I lost something" / "I found something"; Crime → the crime type; Missing person → adult / child; Find help → police / hospital / fire.
- Enforced server-side and generically: if a reply asks a question but emits neither a step card nor suggestions, the turn is completed with options derived from the active flow and step, so a bare prose question can never reach the screen — regardless of topic.

**No greeting on a concrete first message**
- A leading greeting/self-introduction is stripped from the reply whenever the user's message already contained a request, rather than relying on the model to obey.

**One subject at a time**
- While a flow is active, broad cross-topic actions (emergency numbers, find help, generate report) are excluded from chips; they return only when the flow completes or the conversation is idle.

## Technical notes

- `src/components/allma/allma-chat.tsx`: `contextualChips` — remove `IDLE_CHIPS` as the post-question fallback (empty state only); expand `STEP_FALLBACK_CHIPS` into a topic-keyed table covering every flow/step type; run the matcher against the assistant's prose text as well as step-card questions.
- `src/routes/api/chat.ts`: after the model turn, when the text ends in a question with no `ask_structured_question` / `suggest_replies` part, append a synthesized `suggest_replies` output built from the derived flow + step state; strip a leading greeting sentence when the first user message carries an intent.
- `src/lib/allma-prompt.ts`: define the opening step and fixed options for each flow, and state that any recognised intent must be answered with a step question rather than prose, with one subject per turn.
