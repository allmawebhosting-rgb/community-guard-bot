---
name: SSR onboarding animation
description: Hydration-safe animation behavior for server-rendered onboarding routes.
---

For server-rendered onboarding screens, the first content render should be deterministic. Do not rely on an opacity/position `initial` animation for the initial route mount; let the content render visible immediately and animate only subsequent step changes.

**Why:** The onboarding route rendered correctly in server HTML but appeared as an empty panel after client hydration when the first step used a hidden motion initial state.

**How to apply:** Use a hydration-safe first render for the step container, then keep transitions for user-triggered navigation between steps.