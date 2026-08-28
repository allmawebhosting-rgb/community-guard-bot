# Premium SOS Redesign — Signal Slate Command Dashboard

Restyle every SOS screen into a professional emergency command surface. Visual and presentation work only: no changes to calling, escalation, location, or database logic.

## Locked design direction

- Palette (Signal Slate): canvas `#111418`, panel `#1E242C`, emergency accent `#E63946`, signal accent `#F1C40F`, with light ink for text.
- Type: Sora for headings and numeric readouts, Manrope for body and labels (loaded alongside existing fonts in the root head).
- Layout: command dashboard — persistent status header, panel grid beneath, one primary action always dominant.

## Screens covered

1. **Idle / activation** — full-bleed slate canvas, single dominant SOS trigger with layered pulse rings, quiet readiness strip (location, network, guardian) below.
2. **Type select** — dense responsive tile grid, icon-left cards with hairline borders, accent glow on hover/press.
3. **Consent** — panelled explanation with toggle rows, clear primary/secondary action pair.
4. **Loading** — command-boot sequence: emergency ID in mono-tabular Sora, staged progress lines that resolve one by one.
5. **Live emergency (minimal + help)** — top status bar (emergency ID, elapsed timer, severity chip, connectivity), then a dashboard grid: live location + map panel, safety-network calling panel, responders panel, guidance steps, emergency lines. Escalation panel keeps its existing real statuses, restyled as telemetry rows.
6. **Escalation panel** — member rows as tracked call lanes: avatar, name, real status pill, ring progress bar, retry state.
7. **Report** — sectioned form on panel surfaces, sticky submit bar, field focus rings in signal yellow.
8. **Submitted** — confirmation panel with reference code readout, next-step list, calm accent instead of celebratory styling.

## Craft details

- Status semantics: red accent reserved for active emergency/critical, yellow for pending/attention, muted slate for idle. No decorative red.
- Panels: 1px hairline borders, subtle inner top highlight, restrained elevation, 14–18px radii, consistent 12/16/24 spacing rhythm.
- Motion (Motion for React, already in project): 180–260ms panel entrances with small y-offset and stagger, breathing pulse on the SOS trigger, animated ring progress on calling lanes, respect `prefers-reduced-motion`.
- Numbers (timers, distance, accuracy, ETA) use tabular figures so they never jitter.
- Mobile-first: single-column stack under 768px, safe-area padding, primary action reachable by thumb; dashboard grid expands from 1 to 2–3 columns upward.

## Technical notes

- Add Signal Slate tokens and font families in `src/styles.css` under `@theme inline` / `:root`, mapped for both light and dark; keep existing semantic token names so no component hardcodes colors.
- Add the Sora + Manrope `<link>` to the head in `src/routes/__root.tsx`.
- Restyle `src/components/allma/sos-experience.tsx` (IdleScreen, TypeSelectScreen, ConsentScreen, LoadingScreen, MinimalEmergencyScreen, HelpScreen, ReportScreen, SubmittedScreen and shared subcomponents: StatusTile, ResponderCard, FacilityRow, FacilitySection, LiveLocationMap, AiChatBubble, SectionLabel).
- Restyle `src/components/allma/sos/emergency-call-escalation.tsx` and `smart-safety-check.tsx` for visual consistency; keep their state machines and props untouched.
- All status text continues to come from real backend rows — no simulated responder or dispatch states introduced.
