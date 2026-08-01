## Goal

Adopt the layout and visual structure of the allma.store demo assistant, keeping all existing Allma Safety AI features (safety chat, conversational reporting, SOS, dashboard).

## What the reference looks like

```text
┌───────────┬──────────────┬────────────────────────────┐
│ nav rail  │ chat list    │  top bar: logo + tabs      │
│ (grouped, │  [+ New chat]│                            │
│ collapsi- │  thread 1    │      [ big AI mark ]       │
│ ble)      │  thread 2    │        Allma Safety AI     │
│           │              │      tagline (2 lines)     │
│ SAFETY    │              │   [chip][chip][chip][chip] │
│ REPORT    │              │   ── START WITH ──         │
│ NEARBY    │              │   [card] [card]            │
│ ─────     │              │   [card] [card]            │
│ avatar    │              │  ┌ composer 📷 📎 … 🎤 ↑ ┐ │
└───────────┴──────────────┴────────────────────────────┘
```

## Layout work

1. **App shell** (`src/components/allma/app-shell.tsx`) using the shadcn sidebar:
   - Left icon-collapsible nav rail with grouped sections: SAFETY (Assistant, Dashboard, Community alerts), REPORT (Report crime, Missing person, Lost & found, Emergency SOS), NEARBY (Police, Hospitals, Fire & ambulance), plus a footer user block with avatar, name, and role badge.
   - Second column: thread list ("Allma chats" header, gradient "New chat" button, active-thread highlight) — moved out of the chat route into the shell.
   - Slim top bar with brand lockup, page tabs, theme toggle, and sidebar trigger. On mobile both columns collapse into sheets.
   - Applied to the chat routes and the dashboard so navigation is consistent.

2. **Hero empty state** (`src/components/allma/assistant-hero.tsx`): centered glowing brand mark with soft radial gradient, large gradient wordmark, two-line tagline, a row of pill suggestion chips ("Report a theft", "Find nearest hospital", "Someone is missing", "Is this area safe tonight?"), a "START WITH" divider, and a 2×2 grid of tinted action cards (Report an incident, Emergency SOS, Missing person, Find help nearby) — each seeds the matching AI conversation. Replaces the current quick-action row on the empty chat screen.

3. **Composer** upgrade in `allma-chat.tsx` around the existing AI Elements `PromptInput`: rounded pill with soft focus glow, camera button, paperclip attach button, mic button on the right of the field, circular send button, thumbnail strip for pending attachments, and the "Verify important advice…"-style safety footnote (reused for the "Police Integration Ready / not officially connected" disclaimer).

## Composer functionality

- **Camera / attach**: file input (`capture="environment"` for camera) → upload to the existing private `evidence` storage bucket under the user's folder → attach signed URLs as image parts on the outgoing message so the model can see them; images render as thumbnails in the transcript. Guests are prompted to sign in before uploading.
- **Voice**: `MediaRecorder`-free Web Audio capture encoded to WAV, posted to a new server route `src/routes/api/transcribe.ts` that calls the Lovable AI transcription endpoint with `openai/gpt-4o-mini-transcribe` and streams the transcript back into the textarea for the user to edit and send.

## Technical notes

- No schema changes; evidence bucket and RLS already exist. Attachment rows optionally recorded in `report_evidence` only when a report is created (unchanged behaviour).
- The chat model, system prompt, tools, and persistence in `src/routes/api/chat.ts` stay as-is.
- Design tokens stay Allma's signal-blue/alert palette in `src/styles.css`; the reference's green is not copied. Add tokens for the card tints, hero glow, and composer glow.
- `allma-chat.tsx` splits into chat transcript + composer + hero components to keep files small.
