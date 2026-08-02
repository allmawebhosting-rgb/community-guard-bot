# Clean up the chat composer border and polish the chat area

## What's wrong now

The composer is wrapped in three separate bordered layers stacked on top of each other, so you see multiple concentric lines around the input:

1. The animated conic-gradient ring (`composer-shell`, 1.5px padding)
2. An inner wrapper with its own `border-border/40` and rounded corners
3. The prompt input itself, which still renders the base input-group border, `shadow-xs`, and a focus ring on top of that

Radii also don't match between the layers, which makes the corners look doubled and slightly off-centre.

## The fix

**One ring, one surface.**

- Keep a single animated gradient ring as the only visible outline. The inner surface becomes a plain filled, blurred card with no border of its own.
- Strip the base border, shadow, and focus ring from the prompt input so it contributes no outline — the gradient ring alone shows focus.
- Match radii exactly across ring and surface so the corners nest cleanly.
- Refine the gradient itself: slower, smoother rotation, softer colour stops through the brand red → warm glow → gold range instead of the current hard conic sweep, and a gentle brightening on focus rather than a thickness jump.
- Recording state stays a distinct red ring, but with the same single-line treatment.
- Reduced-motion users get a static gradient border, no rotation.

**Chat area polish (light pass, same visual language)**

- Align the option buttons, step card, and suggestion chips to one border weight and one radius scale so the transcript doesn't read as a stack of differently-outlined boxes.
- Assistant text stays bubble-free; user bubble keeps its gradient fill.
- Tool/facility/report cards use the existing `chat-card` glass treatment consistently instead of ad-hoc `border-border/50` variants.

## Technical notes

- `src/components/allma/allma-chat.tsx`: remove the intermediate bordered wrapper around `PromptInput`; move the surface background onto a single inner element; add `border-transparent shadow-none` plus focus-ring suppression to the `PromptInput` className; normalise card/button border classes in the transcript.
- `src/styles.css`: rework `composer-shell`, `composer-shell-focused`, `composer-shell-recording` — single ring, matched `border-radius`, refined gradient stops, reduced-motion fallback.

No colour values are hard-coded; everything stays on the existing tokens.
