---
name: SOS location privacy
description: Privacy and freshness rules for location-based community responder matching.
---

Nearby responder matching must be opt-in and must not expose another person's exact coordinates. Presence should be considered stale after a short inactivity window, and the matching response should contain only a display name and approximate distance.

**Why:** Emergency location data is highly sensitive, and a demo list of named responders is misleading if no real people have opted in or checked in recently.

**How to apply:** Keep responder presence behind explicit user consent, enforce the privacy boundary in a server-side function rather than relying only on UI behavior, and avoid displaying or returning responder latitude/longitude to SOS users.