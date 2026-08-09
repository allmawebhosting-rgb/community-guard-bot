---
name: Mobile chat viewport containment
description: The layout constraints needed to keep mobile chat composers fixed while message history scrolls.
---

Mobile chat layouts can still scroll at the document level even when the message pane has `overflow-y-auto`. A full-height child beneath a mobile header can exceed the viewport, especially when flex descendants rely on `h-full`.

**Why:** Nested flex sizing alone did not prevent page scrolling on mobile; the browser root remained an active scroll container.

**How to apply:** For route-specific chat screens, remove conflicting `h-full` sizing below the header, keep every flex boundary `min-h-0`, size the outer shell to the dynamic viewport, and temporarily lock `html` and `body` overflow while the route is active. Leave the message/history pane as the only vertical scroll container.