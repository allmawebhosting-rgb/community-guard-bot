# One model request per turn — inline flow, suggestions and step cards

Today the chrome around a reply (flow banner, step question with tappable options, suggestion chips) is produced by separate tool calls: `ask_structured_question`, `suggest_replies`, `request_media`. Each of those is a full billed model request, so a turn that answers a question and offers three chips costs 2–4 requests.

The target usage pattern is one request per turn: the model writes its answer and embeds the UI as inline markers in the same text, e.g.

```text
::flow{type=reporting, step=1, total=4, title="What kind of incident?"}
I can help you log a crime report. What kind of incident is this?
::suggest[Theft | Robbery | Assault | Something else]
```

Real data tools (marketplace/facility search, report creation, memory) still run as tool calls, because they fetch or write real data — but the chrome no longer costs extra steps.

## What changes

**Inline markers replace chrome tools**
- Remove `ask_structured_question`, `suggest_replies` and `request_media` from the tool list.
- The assistant instead writes, at most once per turn:
  - `::flow{type=..., step=N, total=M, title="..."}` — the flow banner
  - `::suggest[Option A | Option B | Option C]` — tappable chips / step answers
  - `::media{type=photo, optional=true, tips="..."}` — the tap-to-attach card
- Everything else (recommendations, report summary, receipts) keeps working as it does now.

**Turn budget**
- One reply per turn, markers included; the model stops after it. Steps drop to 2 (one optional data tool call plus the reply), so a normal answer is a single billed request and a data-backed answer is two.

**Same UI, new source**
- The existing flow banner, option chips, suggestion row and attach card render unchanged — they are fed from the parsed markers instead of tool outputs.
- Marker text is stripped from the visible message body, so nothing leaks into the bubble.
- Old threads still render: messages already stored with `tool-ask_structured_question` / `tool-suggest_replies` parts keep their current rendering path.

**Server-side flow counter stays authoritative**
- The step number and flow label are still derived from the thread on the server and injected into the prompt, so the banner only moves forward and the flow name stays fixed even though the model now writes the numbers itself.

**Prompt**
- The instruction blocks are rewritten to teach the marker syntax and the one-reply rule, and the intent/flow/location guidance now points at markers instead of tool names. Wording of the actual replies stays the same.

## Result

- A question-plus-chips turn: 1 request (was 2–4).
- A turn that needs real data (nearest station, marketplace, filing a report): 2 requests.
- No change to guided flows, SOS, facility search, report filing or the police assistant.

## Technical notes

- `src/routes/api/chat.ts`: drop the three chrome tools, lower `stopWhen` to `stepCountIs(2)`, keep `flowState` derivation for the prompt block, and remove the `cardIssued` suppression logic those tools used.
- `src/lib/allma-prompt.ts`: replace tool-name instructions with the marker contract in `ALLMA_CORE_PROMPT` and the reporting/location blocks.
- `src/components/allma/allma-chat.tsx`: add a marker parser (`::flow`, `::suggest`, `::media`) over assistant text parts; route parsed values into the existing `FlowBanner`, chip row and attach-card components; keep the legacy tool-part branches for stored history; keep `ATTACH_CHIP` / `LOCATION_CHIP` sentinels working from parsed suggestions.
- Greeting short-circuit keeps its zero-credit local path, emitting the same suggestions as an inline `::suggest` line.
