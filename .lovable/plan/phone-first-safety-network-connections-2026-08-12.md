# Phone-first Safety Network connections

Today the "trusted circle" is only a local list of names saved to `emergency_contacts` — there is no real account-to-account link. This adds the missing connection layer on top of what already exists, with phone number as the single discovery method.

## The flow

```text
+ Add Safety Contact
   -> "Find someone on ALLMA"  [ +256 7XX XXX XXX ]  [ Search ALLMA ]
   -> found:    limited profile (photo, name, Verified badge) -> Send Connection Request
   -> not found: "No ALLMA account found for this number." -> Invite to ALLMA (share link)
   -> recipient accepts -> connection created
   -> requester picks Safety Role -> configures emergency permissions
```

Nothing connects automatically. A found account is never revealed beyond photo + display name + verified badge.

## What gets built

**Discovery**
- One phone field with a `+256` prefix, numeric keypad on mobile, live formatting, and a single primary Search button. Full-width sheet on mobile, centred dialog on desktop.
- Ugandan normalisation: `077…`, `2567…`, `+2567…`, and spaced/dashed variants all resolve to one canonical `+2567XXXXXXX` value.
- Results render as one calm card: avatar, name, "Verified ALLMA Member", one action. Loading is a skeleton of that same card, so the layout never jumps.

**Connection lifecycle**
- New requests table with states pending / accepted / declined / cancelled / blocked.
- Accepted requests create a connection row for both sides, then prompt the requester for a safety role (Family, Friend, Neighbour, Partner, Community helper, First aider) and per-connection emergency permissions (notify on SOS, share location on SOS, allow calls).
- An inbox on the profile page for incoming requests: Accept, Decline, Block.
- Existing `emergency_contacts` stays as-is for people who are not on ALLMA; connected members are shown alongside them in the same circle list, marked as verified ALLMA links.

**Guards**
- Cannot request yourself, cannot duplicate an existing pending/accepted pair, cannot reach someone who blocked you (blocked pairs return "no account found").
- Search runs through one server-side lookup that returns only the limited profile — never phone, location, contacts or private fields.
- Rate limiting: capped lookups per user per hour and per day, with a friendly "Too many searches, try again later" state; failed lookups count toward the cap so numbers cannot be enumerated.
- Only accounts with a verified phone are discoverable, and each user gets a "discoverable by phone" switch in profile settings (on by default).

## Technical notes

- Migration adds `safety_connection_requests`, `safety_connections` (role + permission columns), `safety_blocks`, `phone_lookup_log`, plus `profiles.phone_e164`, `phone_verified`, `discoverable_by_phone`. Full GRANT + RLS on each; no table exposes another user's phone.
- Lookup and request creation go through security-definer database functions (`find_allma_member_by_phone`, `send_safety_connection_request`, `respond_to_safety_connection_request`) so RLS never has to expose the profiles table by phone. Rate-limit counting lives inside the lookup function.
- Normalisation helper in `src/lib/phone.ts`, shared by client formatting and the database function (SQL mirror).
- UI: new `src/components/allma/safety-network/` (add-contact sheet, search result card, request inbox, role/permission step) reused by both the onboarding Circle step and the profile page — one component set, no second connection system.
