# Premium Safety Network redesign

## Goal
Turn Safety Network into a dedicated, trustworthy emergency-response workspace using the selected Signal White utility direction, while preserving every existing connection, permission, notification, call, SOS, location, and privacy behavior.

## What will change
- Add a dedicated authenticated Safety Network page with a focused desktop sidebar and clean mobile navigation.
- Present real readiness information: connected people, incoming requests, outgoing requests, and the three responder tiers.
- Redesign trusted-person cards around photo or initials, name, relationship role, response tier, verification, permissions, call, edit, and remove actions.
- Replace technical Priority 1/2/3 wording with Primary responder, Backup responder, and Additional responder throughout management and caller SOS views; numeric values remain unchanged internally.
- Upgrade the add-person flow with a clear privacy introduction, phone search, real member result, request preview, sent state, and honest non-member invitation state.
- Restyle the onboarding Safety Network step to use the same visual language and distinguish persisted Allma connections from optional invitations.
- Refine caller-side responder progress using real call attempts only, with clear Waiting, Notified, Calling, Connected, Declined, No answer, and Failed states.
- Keep the existing receiver emergency screen and enhance only shared visual consistency where supported by real caller data.
- Add scoped Signal White tokens and restrained, reduced-motion-safe transitions.

## Data and privacy boundaries
- Use only real names, profile photos, saved roles, numeric response tiers, request states, permissions, and call-attempt states.
- Show only the supported permissions: SOS alerts, location during SOS, and in-app emergency calls.
- Do not show phone numbers, email addresses, live availability, invented relationships, simulated response activity, or claims that emergency services were contacted.
- Keep mutual call permission, location privacy, authentication, database rules, APIs, routes, notifications, and ZEGOCLOUD logic unchanged.

## Verification
- Check the app for type and render errors.
- Verify the dedicated Safety Network page and profile integration at desktop and mobile sizes.
- Test opening add-person, expanding/editing a contact, permission controls, request actions, and navigation without triggering a real SOS or notifying real contacts.
- Confirm no horizontal overflow and reduced-motion behavior.
