---
name: Phase 4 responder rollout
description: Production boundary for the Community Responder Network.
---

The Community Responder Network should be treated as a supplementary, opt-in assistance layer until a server-side matching worker connects real SOS events to fresh, permissioned responder presence.

**Why:** The UI and database can safely model onboarding, availability, approximate distance, assignment transitions, and safety warnings, but client-side discovery or simulated fan-out would risk exposing location or implying real help was contacted.

**How to apply:** Keep matching, staged notification waves, exact-location access, and assignment creation behind authenticated server functions or workers. Keep demo mode visibly separate from real emergency state.