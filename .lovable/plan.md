# Fix SOS call location and calls that never connect

## What is actually broken (verified against the live database)

**1. Location never reaches the person you call.**
Of 160 SOS activations, only 1 ever stored coordinates — every other row still reads "Location pending" with empty latitude/longitude. The reason: the SOS record is created first and the GPS position is saved a second later with an update, but the activity table has **no update rule at all** (only insert and read rules exist). So every location save is silently rejected. The receiver's call screen then correctly reports "Location not available" because there is genuinely nothing stored.

**2. No call has ever connected.**
Over the last two days: 442 calls ended, 25 declined, 12 stuck at "initiating", and 54 failed — every single failure with the same reason, "Microphone access is required for an Allma voice call." Not one call reached the connected state. Audio is requested only after the voice room has been joined, which on a phone happens well after the tap that started the call, so the browser/iOS no longer treats it as a user action and refuses the microphone. During SOS auto-dial there is no tap at all, so the caller side fails within ~3 seconds of every attempt.

## Changes

### 1. Allow the SOS location to be saved (and shown live)

- Add an update rule so a person can update their own safety activity row (and keep officer/receiver access unchanged).
- The receiver's call screen refreshes the emergency context when the caller's location arrives, instead of only reading it once at ring time — so "Location pending" turns into the real area within seconds.
- Show the location properly on the incoming/active call screen: area text, accuracy, and an "Open in Maps" action when coordinates exist; an honest "Location not shared" line when they don't.
- If the phone refuses location, the SOS screen says so plainly and offers a retry, rather than leaving a silent "pending".

### 2. Make answered calls actually connect

- Ask for the microphone at the moment of the tap — the SOS activation tap for the caller, the Answer tap for the receiver — and reuse that same audio for the call and for every follow-up attempt in the SOS round. This is the single change that fixes the recurring microphone failure.
- Mark the call as connecting only once audio is genuinely captured, so the receiver never sees a call that cannot carry sound.
- If the microphone is blocked, show one clear message with an "Enable microphone and retry" action instead of failing the call silently 54 times in a row.
- Calls stuck at "initiating" (the receiver's device never picked up the ring) are closed out with the honest "No answer" state after the ring window instead of lingering.

## Technical notes

- Migration: `CREATE POLICY "Users can update their own activity" ON public.safety_activity FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);` (verified missing via `pg_policies`).
- `src/components/allma/sos-experience.tsx`: report the update error to the user path, and keep `location_text`/lat/lng write as-is once the policy exists.
- `src/components/allma/calls/call-center.tsx`: re-poll `get_emergency_call_context` on a short interval / on `safety_activity` UPDATE realtime while `phase === "incoming" | "active"`; render area + maps link from `latitude/longitude`.
- `src/lib/zego-call.ts`: acquire `getUserMedia` (or `engine.createStream`) before `loginRoom`, accept an optional pre-warmed `MediaStream` in `VoiceCallEngine`, and expose a `primeMicrophone()` helper called from the SOS activate handler and from `answer()`.
- `src/lib/sos-escalation-controller.ts`: pass the primed stream through sequential attempts; do not re-prompt per attempt.
- No changes to escalation order, ring duration, or ZEGOCLOUD credentials.

## Verification

- After a test SOS: the activity row shows real coordinates and a real `location_text`; the receiver's call screen shows the area.
- `emergency_calls` shows rows reaching `connecting` then `connected` with `connected_at` set, and no new "Microphone access is required" failures.

## Also needed

- The SOS screen currently has a missing import for its toast helper (`src/components/allma/sos-experience.tsx`), which breaks the build. Adding `import { toast } from "sonner";` is included in this work.
