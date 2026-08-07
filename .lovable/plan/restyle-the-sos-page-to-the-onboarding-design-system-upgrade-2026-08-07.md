# Restyle the SOS page to the onboarding design system + upgrade the map

## Goal

The Emergency SOS page currently uses its own hard-coded dark palette (`#060606` backgrounds, `text-white/82`, `bg-red-950`, `border-white/10` — around 129 lines of one-off colour classes). The police onboarding wizard, by contrast, is built entirely on the shared design system: `signal-streak` page background, `premium-surface` rounded cards, semantic tokens (`primary`, `gold`, `border`, `muted-foreground`, `secondary`), and a gradient progress rail.

This work brings the SOS experience onto that same system and rebuilds the location map into a proper, useful panel.

## Part 1 — SOS page adopts the onboarding design system

Restyle `SOSExperience` (and its sub-sections) without changing any of the SOS logic, timings, geolocation, responder matching, or database writes.

- Page shell: `signal-streak` background, same max-width and padding rhythm as the wizard, with a matching brand header row (gradient icon tile + title/subtitle).
- Cards: every section panel (AI guidance, "What to do right now", timeline, call numbers, status tiles, responders, escalation desk) becomes a `premium-surface` rounded-3xl card with `border-border/60` and `shadow-lift`, matching the wizard's card treatment.
- Colour: replace all one-off classes with semantic tokens.
  - `text-white/xx` -> `text-foreground` / `text-muted-foreground`
  - `bg-red-950/18`, `border-red-900/30` -> `bg-destructive/10`, `border-destructive/30`
  - amber accents -> `gold` token; green "done" states -> `success` token
  - The big SOS button and the emergency call tiles keep their urgent red identity, but through `destructive` / `primary` gradient tokens instead of literal hex and `red-700`.
- Steps and progress: the activation stages reuse the wizard's gradient progress rail and the numbered step-chip pattern, so activating SOS visually reads as the same guided flow.
- Section headings adopt the wizard's uppercase tracked label style.
- Both light and dark mode are checked — today the page assumes dark only.

## Part 2 — Improved map display

Replace the small filtered OpenStreetMap iframe with a purpose-built location panel:

- Taller, responsive map (about 60% taller on mobile, full-height panel column on desktop) inside a `premium-surface` card.
- A real accuracy circle drawn to scale around the pulsing "you are here" marker, instead of only a static ping.
- Map controls: zoom in / zoom out and a "recenter on me" button, styled as design-system pill buttons floating over the map.
- Nearby-help layer: the already-fetched hospitals and police stations are shown as labelled markers, with a legend chip row (You / Hospital / Police).
- Footer bar restyled to tokens, showing the address, district, GPS accuracy, and a live "GPS locked" indicator.
- Action row under the map: "Open in Maps", "Get directions", and "Copy coordinates", each opening the correct external link or copying to clipboard with a toast.
- Graceful states: a skeleton while the location is resolving, and a clear "location unavailable — enable location access" card with a retry button when permission is denied.

## Technical notes

- Files touched: `src/components/allma/sos-experience.tsx` (styling + map panel), and `src/styles.css` only if a token is genuinely missing (e.g. a shared SOS glow shadow).
- The map stays on the free OpenStreetMap embed so no new API key or connector is required. Zoom / recenter are implemented by recomputing the embed bounding box from a zoom level in component state; markers and the accuracy ring are DOM overlays positioned from the same bounding box, so no map library is added.
- If you would rather have a fully interactive vector map (smooth drag-pan, live marker clustering), that needs the Google Maps or Mapbox connector — tell me and I will do that instead.
- No changes to Supabase tables, RLS, the responder matching logic, or the SOS report write path.
