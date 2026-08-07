---
name: Imported project dependency bootstrap
description: Dependency restoration behavior for imported JavaScript projects with a committed lockfile.
---

When an imported project is missing its dependency directory, restoring dependencies can resolve newer versions within semver ranges and rewrite the lockfile even when no dependency change was intended.

**Why:** This can create unrelated manifest and generated-file drift during setup, making a focused feature diff harder to review.

**How to apply:** Restore the dependency directory as needed, then inspect and revert incidental package and generated-file changes before finishing; keep only intentional code changes.