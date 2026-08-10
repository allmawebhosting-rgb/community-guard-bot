---
name: Phase 3 emergency communication boundary
description: Safety and provider boundary for Allma in-app emergency calling.
---

Phase 3 must keep demo emergency calls visibly separate from production communication. Until a provider confirms a real session, the UI must not claim that a call connected or that official assistance was notified.

**Why:** Emergency workflows require trustworthy state claims, participant consent, privacy controls, and server-authorized voice sessions; a simulated interaction must never be mistaken for real help.

**How to apply:** Keep voice provider integration behind the adapter boundary, rank only opted-in and eligible responders, preserve critical official escalation, and scope realtime data to authorized participants.