# Fix the incoming call screen: wasted desktop space + hidden Answer/Decline on mobile

## What's wrong today

The full-screen call overlay (`CallCenter`) is one centred narrow column capped at `max-w-sm`. On a 1338px desktop that leaves large empty margins either side — the emergency card and map sit in a phone-width strip in the middle.

The content area is `flex-1` with no scrolling. On a phone, the emergency details card plus the live map plus "Open emergency chat" make the content taller than the viewport, so the Answer / Decline row at the bottom is pushed out of view and cannot be reached.

## What will change

### 1. Answer / Decline always reachable (mobile)

- Make the content region scrollable (`min-h-0` + `overflow-y-auto`) instead of an unbounded flex child.
- Pin the call action bar to the bottom of the overlay with a subtle glass/blur background and safe-area padding, so Decline and Answer are always visible regardless of how much emergency detail is shown.
- Reduce the vertical padding stack on small screens (avatar/badge/spacers) so the essentials fit without scrolling in the common case.

### 2. Real desktop layout (no dead side space)

At `lg` and above, lay the overlay out as two columns inside a wider container (about `max-w-5xl`):

```text
+-----------------------------------------------------------+
|  ALLMA EMERGENCY CALL                                     |
+---------------------------+-------------------------------+
| Avatar, "X is in danger"  | Emergency card                |
| status line               | Live location map (larger)    |
| privacy note              | Open emergency chat           |
| [Decline]     [Answer]    |                               |
+---------------------------+-------------------------------+
```

- Mobile stays a single column exactly as today (just scrollable with a pinned action bar).
- The map card gets more height on desktop so it reads as a real map, not a strip.
- Active-call controls (mute / speaker / end) and the ended state keep their current behaviour and placement.

## Technical notes

- Single file: `src/components/allma/calls/call-center.tsx` — layout/classNames only.
- No changes to call signalling, answer/decline handlers, Zego wiring, emergency data fetching, or location sharing.
- Verification: Playwright screenshots of the incoming-call overlay at 1338x897 and at 390x844 (with emergency card + map present) to confirm the desktop two-column fill and that Answer/Decline are visible on mobile.
