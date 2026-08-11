---
name: Phase 9 emergency UI boundary
description: Truthful status language and low-connectivity behavior for the emergency communication interface.
---

Phase 9 emergency UI must distinguish actual system events from available actions and simulated/demo states. Use explicit labels such as connected, not connected, simulated, unavailable, pending configuration, dialer opened, and waiting for acknowledgement; never imply that an official service or responder was contacted without confirmation.

**Why:** The Phase 9 specification makes Allma a coordination layer rather than an emergency authority, and emergency users need reliable state information even when connectivity or integrations are incomplete.

**How to apply:** Keep the citizen screen centered on active request status, location state, response status, people contacted, next escalation, and safe-resolution controls. In limited connectivity, prioritize the emergency event, coordinates, and text, and say when information is queued rather than transmitted.