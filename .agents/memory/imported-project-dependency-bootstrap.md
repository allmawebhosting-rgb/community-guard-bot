---
name: Imported project dependency bootstrap
description: Dependency restoration behavior for imported JavaScript projects with a committed lockfile.
---

When an imported project is missing its dependency directory, restoring dependencies can resolve newer versions within semver ranges and rewrite the lockfile even when no dependency change was intended. The Replit Bun package callback runs `bun add`, which can also update the manifest and `.replit` module list; use the committed lockfile in frozen mode when restoring an existing dependency set. Imported lockfiles can include packages whose Node engine requirements are newer than the configured runtime, causing tests to fail before collection even when a production build passes.

**Why:** This can create unrelated manifest and generated-file drift during setup, or leave validation blocked by mismatched peer dependencies and runtime APIs.

**How to apply:** Prefer a frozen install from the committed lockfile for dependency restoration. If using a package-add workflow, inspect and revert incidental package, lockfile, and runtime-configuration changes. When tests fail before collection, compare dependency engine requirements with the configured Node runtime before changing application code.