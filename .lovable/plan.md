# Upgrade Allma Safety AI — capabilities + composer polish

The uploaded reference describes the AgriHub version of Allma AI (farming). This plan ports the *patterns* that make it feel premium and capable, translated to the safety/emergency domain, and refreshes the chat UI — especially the message composer border.

## 1. Smarter assistant (safety-focused)

Add memory and continuity so Allma stops starting from scratch:

- **Remember facts** — district/area, home landmark, preferred language, emergency contact name, whether the user prefers anonymous reporting.
- **Recall past chats** — the assistant can search earlier conversations ("the phone I reported last week").
- **Save & resume drafts** — an interrupted crime/missing-person report can be picked back up later.
- **Report follow-up** — look up the user's own filed reports by reference number and state their status in chat instead of only pointing at the dashboard.
- **Nearby help intelligence** — keep `find_facilities`, add distance/priority ordering and a "call now" action on results.
- **Match related reports** — surface possible matches (lost item vs. found item in the same area).

Behaviour rules from the reference that already fit safety stay as-is (one question per turn, confirmation gate before filing, subject fixation, cross-suggest only after flow completion). The system prompt gets a memory/recall/draft section and a follow-up section.

## 2. Richer in-chat components

- **Flow progress header** — a slim bar at the top of an active report flow showing flow name, step, and title.
- **Suggestion chips** — tappable next-step options under assistant replies.
- **Tool activity pills** — live "Searching nearby stations…", "Filing report…" indicators.
- **Receipt card polish** — reference number, risk badge, status, copy-reference button.
- **Facility cards** — name, distance, phone with tap-to-call.
- **Copy button** on assistant messages.
- **Launcher tiles** in the empty state, safety-themed: Report a crime, Missing person, Lost & found, Find help nearby.

## 3. Composer redesign (main UI ask)

- Replace the flat `border-border/55` shell with a **gradient conic ring** that idles subtly and brightens on focus-within, using existing `--primary` / `--primary-glow` tokens.
- Crisper focus state: ring thickens, glow intensifies, background lifts.
- Recording state: ring turns to the destructive/alert hue and pulses while the mic is live.
- Better internal spacing so the `+`, mic, and send buttons never crowd the edges; send button stays a fixed-size icon control.
- Attachment thumbnails move inside the composer shell instead of floating above it.
- Keep the safe-area-aware bottom lock and mobile sizing.

## 4. Model resilience

Add fallback model cycling on gateway 429/5xx so a busy model doesn't kill a report mid-flow, with a small in-chat notice when a backup model answers.

## Technical notes

- New tables: `ai_user_memory` (user-scoped facts) and a `draft_data` field on threads, both with RLS scoped to `auth.uid()` and explicit grants.
- New tools in `src/routes/api/chat.ts`: `remember`, `recall_history`, `save_draft`, `get_draft`, `my_reports`.
- Prompt changes in `src/lib/allma-prompt.ts`.
- UI changes in `src/components/allma/allma-chat.tsx` plus new ring utilities in `src/styles.css`.
- Explicitly **not** ported from the reference: marketplace, listings, orders, offers, equipment rental, crop/livestock diagnosis, WhatsApp handoff, admin provider switcher.
