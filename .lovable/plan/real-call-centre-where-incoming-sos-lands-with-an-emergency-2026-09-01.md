# Real call centre: where incoming SOS lands, with an emergency chat

Today `/calls` only shows voice history, and an incoming SOS appears as a full-screen ring overlay (`CallCenter`) with Answer / Decline and nothing else. If a receiver misses the ring, or answers but needs details ("which gate?", "is he still there?"), there is nowhere to ask. This turns `/calls` into a real call centre: a live inbox of emergencies aimed at you, the active call controls, and a shared emergency chat per SOS.

Decisions taken (questions were skipped): `/calls` becomes the call centre, the chat is **one shared emergency room** per SOS (person in danger + everyone alerted), and the inbox shows **Safety Network SOS invitations plus nearby responder offers**.

## What the receiver sees

1. **Live emergency inbox** — top of `/calls`. Each card shows who triggered SOS, emergency type, severity, area, how long ago, ring/answer state, and distance for responder offers. New emergencies arrive in real time and the card pulses while ringing.
2. **Card actions** — Answer (joins the voice call), Decline, and **Open chat**. Chat is available even after a missed or declined ring, as long as the emergency is still open, so a receiver can still help.
3. **Emergency room** — a chat panel per SOS showing: the sender's live location map (same `LiveLocationMap` used on the SOS screen) when location is shared, live GPS/area line, participant list, and the message thread. Receivers ask for details and get replies before meeting the sender.
4. **System lines in the thread** — call answered/declined/missed, responder accepted, location updated. These are written as event rows, never invented: nothing shows unless a real row exists.
5. **History below** — the existing `CallHistory` list stays, unchanged.
6. The existing full-screen ring overlay keeps working everywhere in the app; from it a receiver can jump to the emergency room.

## Sender side

The SOS screen gets a compact "Messages" strip during an active emergency: unread count, latest incoming question, and a reply box that opens the same shared room. No new SOS phase, no change to the escalation/calling logic.

## Backend work

`emergency_chat_events` already exists (`sos_session_id`, `author_id`, `event_type`, `body`) but is unusable as a chat today: it has only a SELECT policy for the author or the SOS owner, and no INSERT policy — invited receivers can neither read nor write.

One migration adds:

- `public.can_access_sos_room(_sos_id uuid, _user_id uuid)` — SECURITY DEFINER, STABLE, `search_path = public`. True when the user owns the `safety_activity` SOS row, or has a row in `emergency_call_invitations` for that emergency, or has a row in the responder-offer table for that SOS.
- Policies on `emergency_chat_events`: replace the SELECT policy with `can_access_sos_room(sos_session_id, auth.uid())`; add INSERT `TO authenticated` with `author_id = auth.uid() AND can_access_sos_room(...) AND event_type = 'message'`. System event rows are written by existing server-side/RPC paths only.
- `GRANT SELECT, INSERT ON public.emergency_chat_events TO authenticated;` `GRANT ALL ... TO service_role;`
- `list_sos_rooms()` — SECURITY DEFINER RPC returning the receiver's open emergency rooms: `sos_activity_id`, sender name/avatar, emergency type, severity, area, `created_at`, my invitation status, my call session id, `distance_m` for responder offers, `location_shared`, plus `last_message_at`/`unread`. Read-only, scoped to `auth.uid()`; never returns phone numbers.
- `get_sos_room(p_sos_id uuid)` — SECURITY DEFINER, access-checked via `can_access_sos_room`: sender name/avatar, emergency type, severity, area, latitude/longitude/accuracy **only** when the SOS owner shared location, and the participant list (display names, no phones).
- Realtime: add `emergency_chat_events` to the `supabase_realtime` publication with full row identity, matching how `emergency_calls` is already set up.

## Frontend work

- `src/lib/sos-rooms.ts` — typed wrappers + TanStack Query options for `list_sos_rooms`, `get_sos_room`, message list, `sendRoomMessage`, and a Realtime subscription helper (unique channel names per room, following the existing collision fix).
- `src/components/allma/calls/sos-inbox.tsx` — the live emergency inbox cards.
- `src/components/allma/calls/emergency-room.tsx` — map + participants + message thread + composer; auto-scrolls, optimistic send, 16px inputs so mobile does not zoom.
- `src/routes/_authenticated/calls.tsx` — rebuilt as the call centre: inbox, selected room (`?room=<sosId>` so a push notification can deep-link straight into it), then history. Route `head()` metadata updated.
- `src/components/allma/calls/call-center.tsx` — the ring overlay gains an "Open chat" action that navigates to `/calls?room=<sosActivityId>`; existing answer/decline/voice logic untouched.
- `src/components/allma/sos-experience.tsx` — add the sender-side messages strip, reusing `emergency-room`.
- Push: incoming-call and SOS-activity notifications carry a `/calls?room=…` deep link so tapping the notification lands in the room.

## Design

Same Uganda-flag / dark-card premium system already used on the SOS and Lost & Found screens: gradient severity accents, soft-shadow cards, motion entry per card, ringing pulse on live emergencies, gold accents for the active room. Messages are bubbles with sender avatars; system events render as centred muted lines.

## Verification

Typecheck, then in the preview: trigger an SOS from one signed-in account, confirm it appears in the other account's `/calls` inbox in real time, open the room, exchange messages both ways, and confirm the map shows only when location is actually shared.
