# Make the Allma assistant genuinely expert and its guided flows reliable

The chat interface, guided step flows, report filing, memory, nearby-help and case tools already exist. Three things hold it back: it runs on a fast, low-cost model that follows long safety instructions loosely, its emergency knowledge is broad rather than Uganda-specific, and the step-by-step safety check drifts (repeats, skips, or drops the answer buttons). This pass fixes those three, then proves it with live conversations.

## 1. Stronger brain behind the same chat

- Move the assistant onto Allma's most capable reasoning model, which follows the long safety procedure far more faithfully — that alone removes most "generic reply" behaviour.
- Keep the existing fast model as an automatic backup if the main one is busy, so a report never dies mid-flow. Today's backup entry is a model this workspace cannot serve, so a busy moment currently means failure — that gets corrected.
- Replies keep streaming as they do now, so nothing feels slower to start.

## 2. Real emergency expertise, not general advice

Give the assistant a tested Uganda safety knowledge set it must follow, covering the situations people actually bring:

- Phone/property theft — SIM block, mobile money freeze, IMEI, what the police need for a case file.
- Robbery and assault — safety first, medical documentation, evidence that survives.
- Missing person and child — the first-hour actions, who to notify, what description details matter.
- Lost and found — matching, handover safety, ownership proof.
- Domestic and gender-based violence — safe-to-talk checks, confidentiality, support pathways.
- Road accidents, fire, and medical emergencies — immediate actions while help is on the way.
- Fraud and mobile-money scams — freeze steps and reporting evidence.
- Correct emergency numbers (Police 999, Emergency 112, Ambulance 911) and district-aware guidance.

Each situation gets the same shape: immediate safety, time-critical actions in order, what to preserve as evidence, then the report. The existing rules stay: never claim police or ambulance were contacted, never claim affiliation, always guide to real emergency numbers for life-threatening cases.

## 3. Safety checks and step flows that always land

- The step counter and flow name stay under the app's control (already true) and are extended to the safety check so it can never restart or count backwards.
- Every step question ends with tappable answers — when the model omits them, the app supplies the correct answers for that exact step instead of leaving a dead end.
- Answers already given can't be re-asked; the flow always ends in either a filed report with a reference number or a clear, honest close.
- Cleaner step presentation in the chat: one flow banner, question text, answer buttons, and a compact attach-a-photo prompt — no competing card styles.

## 4. Chat screen finishing

- Consistent assistant/user message styling, no colour-on-colour readability problems.
- Answer buttons wrap into rows on mobile instead of a cramped scroll strip.
- Composer stays focused after sending, after a reply finishes, and after switching conversations.
- Clear, plain-language message when the AI is rate-limited or out of credit, instead of a silent stall.

## 5. Live end-to-end proof

I run real conversations in the running app and report exactly what happened:

- Phone theft in Kampala → full guided flow → filed report with its real reference number.
- Missing child → safety check → report.
- "I am not safe right now" → immediate-danger path.
- Nearest hospital / police station → real nearby results.
- One deliberate wrong turn (vague answer, mid-flow topic change) to confirm the flow recovers.

Each scenario is reported with what the assistant said and what was actually saved. Anything that does not work gets named plainly rather than glossed over.

## Technical notes

- `src/routes/api/chat.ts`: switch the primary chat model to `openai/gpt-6-astra` via the gateway Responses API (streaming, `store: false`), keep `google/gemini-3.6-flash` as fallback on 429/5xx and drop the unavailable `google/gemini-2.5-flash` entry; extend the server-derived flow state to cover the safety-check flow; surface gateway 402/403/429 states to the client.
- `src/lib/allma-prompt.ts`: new `ALLMA_PROCEDURES_BLOCK` holding the per-situation playbooks, appended when a flow or matching intent is active; tighten step and suggestion rules.
- `src/components/allma/allma-chat.tsx`: per-step chip fallbacks keyed to step type, unified step presentation, mobile chip wrapping, focus handling, error surface.
- No schema changes; reports, memory, drafts, cases, SOS, calling and auth are untouched.
