# Cut the credit cost of every chat turn

Saying "hi" currently costs ~0.27 credits and fires 4 separate model requests. Two causes, both confirmed in the code:

1. **The turn is allowed to run up to 50 model steps** (`stopWhen: stepCountIs(50)` in the chat route). After the greeting the model kept going on its own: it suggested replies, then dumped the whole 6-step tour, then suggested replies again, then opened a crime-report question card — all without the user typing anything. Each step is a full billed request.
2. **The instruction prompt is ~36 KB (≈9k tokens) and is resent on every one of those steps**, so a one-word "hi" pays for ~36k input tokens plus 18 tool definitions.

## What changes

**Cap the steps per turn**
- Limit a turn to a small number of model steps (3) instead of 50. Long flows still work, because each user tap starts a new turn.
- Add an explicit rule: one reply plus at most one interactive card or one suggestion set per turn, then stop and wait for the user.

**Stop the unrequested tour**
- The tour must only be produced when the user actually accepts it. On a bare greeting the assistant answers with the short welcome and the "quick tour?" question in a single turn, and does nothing further.
- Do not call `suggest_replies` twice in one turn, and never in the same turn as a question card.

**Shrink what gets sent per request**
- Split the instruction prompt into a compact always-on core (identity, tone, safety rules, flow rules) plus flow-specific detail blocks that are appended only when that topic is actually active — reusing the intent detection already in the route.
- Only send the tool definitions relevant to the turn: a lightweight set (question card, suggestions, media request, facilities/location) for greetings and general chat; the full set once a reporting, SOS or case flow is active.

**Trivial turns skip the model where safe**
- A bare greeting with no prior conversation is answered from a fixed welcome message plus the tour question, with no gateway call at all. Anything beyond a greeting goes to the model as usual.

## Result

- "hi" costs ~0 credits and returns instantly.
- A real question costs one request with a much smaller prompt instead of four large ones.
- No behaviour change to guided flows, reporting, SOS, facility search or the police assistant.

## Technical notes

- `src/routes/api/chat.ts`: lower `stopWhen`, build the tool map conditionally, assemble the system prompt from core + active-topic blocks, and short-circuit greeting-only first messages.
- `src/lib/allma-prompt.ts`: split the single exported prompt into `ALLMA_CORE_PROMPT` and per-topic blocks; keep the existing wording so responses stay the same.
- Model stays `google/gemini-3.6-flash` with the existing fallback.
