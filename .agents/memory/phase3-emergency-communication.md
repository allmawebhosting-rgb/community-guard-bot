---
name: Phase 3 emergency communication boundary
description: Safety and provider boundary for Allma in-app emergency calling.
---

Phase 3 must keep demo emergency calls visibly separate from production communication. Until a provider confirms a real session, the UI must not claim that a call connected or that official assistance was notified.

**Why:** Emergency workflows require trustworthy state claims, participant consent, privacy controls, and server-authorized voice sessions; a simulated interaction must never be mistaken for real help.

**How to apply:** Keep voice provider integration behind the adapter boundary, rank only opted-in and eligible responders, preserve critical official escalation, and scope realtime data to authorized participants.

The production voice boundary should remain provider-neutral and fail closed: server-only provider credentials issue short-lived browser sessions, while the server persists and confirms call state before the UI can say “Connected.”

**Why:** No approved provider or signaling contract was available in the imported workspace, so choosing a vendor would create an unsafe false integration and could expose long-lived credentials.

**How to apply:** Configure `VOICE_PROVIDER_BASE_URL` and `VOICE_PROVIDER_API_KEY` only after selecting an approved provider whose session API supplies authenticated signaling, expiry, ICE/TURN servers, authoritative state, and reconnect-compatible status updates.