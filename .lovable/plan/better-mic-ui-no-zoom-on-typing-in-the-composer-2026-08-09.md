# Better mic UI + no zoom-on-typing in the composer

## 1. Stop the mobile zoom that breaks the layout

The composer textarea renders at 14px. Mobile Safari auto-zooms any focused input smaller than 16px, which shifts the whole chat layout and leaves the page scaled.

- Set the composer textarea to 16px on small screens (keep the tighter 14px look from `sm:` upward) so iOS never zooms.
- Do the same for any other focusable input in the chat surface (attach sheet fields) so focus never triggers zoom.
- Do not disable pinch zoom globally via `maximum-scale` — that hurts accessibility; the font-size fix is the correct one.

## 2. Mic button redesign

Idle:
- Slightly larger, clearly tappable circular control with a soft surface behind the icon rather than a bare glyph, aligned in size with the send button.
- Tooltip/aria label "Voice input"; hidden entirely when unsupported.

Recording:
- The mic swaps to a solid alert-toned button with a gentle pulsing halo (reduced-motion users get a static ring).
- A live waveform/level meter of 4-5 bars animates from real mic amplitude next to the mic, replacing the placeholder text area hint, plus an MM:SS elapsed timer.
- A cancel (X) control appears so a recording can be discarded without transcribing.
- Send button is hidden while recording; tapping the mic stops and transcribes.

Transcribing:
- Mic becomes a spinner with "Transcribing…" inline text; composer stays disabled but the typed text is preserved.

## 3. Recording behaviour fixes

- Expose the audio level from the voice hook so the meter reflects real input.
- Add a `cancel()` path that stops the stream and drops the buffer without calling the transcription endpoint.
- Auto-stop at 2 minutes with a short notice so a forgotten recording doesn't run forever.
- Release the mic stream on unmount/navigation.
- Transcribed text is appended and the caret placed at the end, as today.

## Technical notes

- `src/components/allma/allma-chat.tsx`: textarea class `text-base sm:text-[14px]`; new inline recording bar (timer, level bars, cancel) inside the composer's inline-end addon; mic button restyle.
- `src/hooks/useVoiceInput.ts`: add an `AnalyserNode` for level output, `cancel()`, max-duration timer, and cleanup on unmount.
- `src/styles.css`: recording pulse/halo utility with a `prefers-reduced-motion` fallback; reuse existing `destructive` tokens, no new colours.
