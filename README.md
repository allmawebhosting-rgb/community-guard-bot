# Allma Safety AI

ALLMA SAFETY AI

Build a world-class AI-powered community safety platform called Allma Safety AI. The entire experience should revolve around a conversational AI assistant instead of traditional forms. Users should feel like they are chatting with an intelligent emergency assistant that guides them through reporting incidents, finding help, and staying safe.

The interface should be premium, modern, mobile-first, fast, responsive, and inspired by ChatGPT, WhatsApp, and Apple design principles. Use smooth animations, rounded cards, beautiful gradients, glassmorphism where appropriate, dark/light mode, and a clean, accessible UI.

HOMEPAGE

The homepage should open directly into the AI assistant.

Display:

"Hello, I'm Allma Safety AI.

How can I help you today?"

Below the message, show quick action buttons:

🚨 Emergency SOS

🚔 Report Crime

👤 Missing Person

🎒 Lost & Found

🏥 Find Hospital

👮 Find Police Station

🚒 Fire Emergency

🚑 Ambulance

📢 Community Alerts

💬 Ask Allma Safety AI

Each button should simply begin the appropriate AI conversation.

------------------------------------------------

AI CHATBOT

The chatbot is the heart of the platform.

It should understand natural language.

Examples:

"My phone has been stolen."

"I found a national ID."

"My child is missing."

"I need an ambulance."

"There is a robbery."

"I saw an accident."

"My neighbour needs help."

"There is a fire."

"I need the nearest police station."

The AI should automatically understand the user's intent and guide them step by step.

------------------------------------------------

CONVERSATIONAL REPORTING

Never show long forms.

Instead ask one question at a time.

Example:

User:

"My motorcycle has been stolen."

AI:

I'm sorry that happened.

Let's create a report.

What time did it happen?

User answers.

Where did it happen?

User answers.

Can you describe the motorcycle?

User answers.

Do you have a photo?

Upload.

What is the registration number?

Continue until complete.

Then:

Generate a professional incident report.

Save everything to Supabase.

------------------------------------------------

EMERGENCY SOS

Include a large floating SOS button.

When pressed:

Ask for confirmation

Request GPS location (with permission)

Display emergency numbers

Allow direct phone call

Generate emergency report

Store emergency

Future-ready for trusted contact notifications

------------------------------------------------

REPORT CRIME

Support reporting:

Theft

Robbery

Assault

Domestic violence

Fraud

Cybercrime

Corruption

Kidnapping

Road accident

Burglary

Animal theft

Vandalism

Other

Allow:

Photo upload

Video upload

Audio recording

GPS location

Anonymous reporting

Incident description

AI should organize everything into a structured report.

------------------------------------------------

MISSING PERSONS

Collect through conversation:

Full name

Age

Gender

Photo

Last seen

Last known location

Clothing description

Contact person

Phone number

Generate a printable missing person poster automatically.

Store in Supabase.

------------------------------------------------

LOST & FOUND

Allow users to report:

Phones

National IDs

Passports

Driving permits

Bags

Wallets

Documents

Vehicles

Motorcycles

Animals

Other property

AI should automatically compare lost and found reports and suggest possible matches.

------------------------------------------------

COMMUNITY ALERTS

Display verified alerts such as:

Crime alerts

Floods

Road closures

Fire

Storms

Missing people

Public emergencies

------------------------------------------------

NEARBY HELP

Display nearby:

Police stations

Hospitals

Fire stations

Ambulance services

Safe shelters

Provide:

Distance

Directions

Call button

------------------------------------------------

AI SAFETY KNOWLEDGE

The AI should answer questions like:

"What should I do after a robbery?"

"What should I do if someone collapses?"

"How do I report cybercrime?"

"What should I do during a flood?"

"What should I do if my child is missing?"

"When should I call an ambulance?"

Provide calm, practical safety guidance while encouraging users to contact emergency services when needed.

------------------------------------------------

USER DASHBOARD

Display:

My Reports

Emergency History

Missing Persons

Lost Items

Found Items

Notifications

Community Alerts

Saved Emergency Contacts

Profile

------------------------------------------------

ADMIN DASHBOARD

Create a secure admin dashboard with:

Live incident feed

Incident map

Case management

Evidence viewer

Missing persons

Lost & Found

Community alerts

Analytics

Search

Filters

Report status

Officer assignment

Audit logs

------------------------------------------------

AI FEATURES

OpenAI integration

Natural language understanding

Conversation memory within reports

Automatic report generation

Incident summarization

Automatic categorization

Duplicate detection

Spam detection

Risk level classification

Multi-language support

------------------------------------------------

NOTIFICATIONS

Real-time notifications for:

Report updates

Emergency alerts

Community alerts

Missing person matches

Lost property matches

------------------------------------------------

AUTHENTICATION

Phone Number

Email

Google Sign-In

Guest Mode

Anonymous Reporting

------------------------------------------------

DATABASE (SUPABASE)

Create tables for:

Users

Profiles

Reports

Crime Reports

Emergency Incidents

Missing Persons

Lost Items

Found Items

Evidence

Community Alerts

Police Stations

Hospitals

Fire Stations

Emergency Contacts

Notifications

AI Conversations

Report Status

Admin Users

Audit Logs

------------------------------------------------

UI

Premium AI chatbot interface

Dark mode

Light mode

Responsive

Fast loading

Smooth animations

Modern typography

Rounded cards

Beautiful gradients

Glassmorphism

Floating AI assistant

Excellent accessibility

------------------------------------------------

ARCHITECTURE

Use React, TypeScript, Tailwind CSS, Supabase, OpenAI API, Google Maps or OpenStreetMap, and Firebase Cloud Messaging.

Build a modular architecture so this project can later become part of the larger Allma AI ecosystem.

------------------------------------------------

SOS CALL → ONE SHARED GROUP CHAT

Answering an SOS call admits that Safety Network member into the **original** Allma AI conversation (`messages.thread_id`). There is no second chat and no message copying.

- Chat turns are published through `publish_conversation_messages` (idempotent). A broken client upsert path had been silently dropping history, so responders opened the correct thread ID with zero rows.
- SOS activation flushes the live Allma timeline into that canonical table before calls fan out.
- Responders load history with `list_shared_conversation_messages` for the original thread — including messages created before SOS.
- `claim_sos_emergency_call` / `open_sos_shared_conversation` return that existing thread only — they never mint a parallel conversation.
- `/api/chat` loads the shared DB history for every participant, publishes each human turn immediately for Realtime, and skips private greeting/openers during an active SOS.
- Ringing, declined, missed, and failed calls do not create chat membership.
- Floating chat heads on the right show who is in the emergency conversation (animated join, call vs chat status).
- When a verified responder answers and joins, the person needing help gets a join popup (deduped; system notification if the tab is hidden).
- Emergency alerts use **Web Push (VAPID)** via `public/sw.js` — not native FCM/APNs/CallKit apps. Devices must enable notifications (and on iPhone, Add to Home Screen). Delivery attempts are audited in `notification_delivery_attempts`.
- During SOS, the composer recipient selector chooses **Ask Allma AI** or **Message Responders** on the same conversation (`messages.recipient`).
- SOS activation no longer waits on GPS; failures are auditable in `sos_activation_events` and show an actionable retry.

------------------------------------------------

ZEGOCLOUD VOICE CALLING

ALLMA uses ZEGOCLOUD RTC for authenticated Safety Network and SOS voice calls. Existing ALLMA authorization, call history, realtime incoming-call UI, and sequential SOS escalation remain the source of truth.

Configure these server-side secrets:

```text
ZEGOCLOUD_APP_ID
ZEGOCLOUD_SERVER_SECRET
ZEGOCLOUD_SERVER_URL
```

`ZEGOCLOUD_SERVER_SECRET` must never use a `VITE_` prefix or appear in frontend code. The authenticated backend endpoint `POST /api/zego-token` verifies the existing `emergency_calls` participant relationship before issuing a short-lived token and unique `allma-call-{callId}` room.

The web RTC SDK is loaded only when a user answers or starts a call. Native Capacitor background calling, APNs/FCM call notifications, iOS CallKit, and Android Telecom integration require native projects and physical-device configuration; this repository does not claim those native behaviors are complete.

------------------------------------------------

OFFLINE GSM VOICE + SMS FALLBACK (INFOBIP)

When an SOS is active and in-app Zego Safety Network calls have **no callable targets** or **round 1 goes unanswered for ~25 seconds**, Allma automatically places outbound TTS voice calls and SMS to the owner's `emergency_contacts` via Infobip. Browsers cannot auto-dial `tel:` without a tap — this path is server-side only (`escalateSosToGsm`).

Set Cloudflare Worker secrets on `community-guard-bot`:

```text
INFOBIP_BASE_URL=https://z4z2mx.api.infobip.com
INFOBIP_API_KEY=...                 # required
INFOBIP_SENDER=...                  # optional caller ID / SMS from; omit to use Infobip default / "AllmaSafety" for SMS
APP_PUBLIC_URL=https://allmasafetyai.online
```

Auth on every Infobip request: `Authorization: App ${INFOBIP_API_KEY}`.

Endpoints used:

- Voice TTS: `POST /tts/3/advanced`
- SMS: `POST /sms/2/text/advanced`

Behavior:

- In-app Zego dials first; GSM fires only when contacts are missing/ineligible or round 1 has no answer.
- Numbers normalized to Infobip form (`07…` / `+2567…` → `2567…`); 999 / 112 / 911 blocked.
- Per-contact sequential voice + SMS; a non-2xx response fails that contact and continues.
- Idempotent once per SOS (`sos_telecom_escalations` + `notification_delivery_attempts` with `provider=infobip`).
- UI confirms only after Infobip returns HTTP 2xx — never mocked.
- Infobip free trial typically only reaches the verified number `+256774520951` — use that for end-to-end tests.
- Legacy route `/api/public/africas-talking-voice` remains unused (no longer part of the call flow).

------------------------------------------------

IMPORTANT

Do not imply that this platform is officially connected to the Uganda Police Force or any emergency service.

Instead, build it as "Police Integration Ready," so reports can be securely stored now and later integrated with official police, ambulance, fire, or government systems if formal partnerships are established.

The final product should feel like the future of community safety: an intelligent AI assistant that helps citizens report incidents, access safety information, find help quickly, and improve communication between communities and emergency responders.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://allma-guardian-ai.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e4db4bc8-087b-46de-a0bc-a8733fb86a3a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Twilio Voice setup

ALLMA now uses Twilio Voice for the existing Safety Network and SOS call flows. The browser receives only short-lived access tokens; Twilio auth secrets stay server-side.

Configure these server secrets in the deployment environment:

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_API_KEY
TWILIO_API_SECRET
TWILIO_TWIML_APP_SID
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Set the Twilio Voice application Voice URL to `https://<your-domain>/api/voice-twiml` using POST. The TwiML route validates Twilio signatures, authorizes the existing ALLMA call record, and routes only to the authorized ALLMA recipient. Set the status callback URL to `https://<your-domain>/api/voice-status` using POST.

Apply the migration `supabase/migrations/20260819090000_twilio_voice_foundation.sql` before enabling calling. It adds Twilio metadata, indexes, and centralized responder/token configuration without creating a duplicate call table.

The current workspace has no Capacitor iOS/Android projects. Web calling is implemented through the Twilio Voice JavaScript SDK. Native background and locked-screen incoming calls still require a Capacitor bridge using Twilio Voice native SDKs, APNs/FCM credentials, CallKit on iOS, and Android Telecom/foreground-service setup; they are not claimed as complete here.


## Live web search in chat

Allma searches Google when someone asks for real-time or external information (news, opening hours, official advisories, prices, weather). The reply is a short conversational summary with clickable source chips underneath. Emergencies, first aid, nearby help, booking, email and reporting never use it.

Set one of these as Cloudflare Worker secrets (first configured provider wins):

```text
SERPER_API_KEY=...                       # Serper.dev, Google results (recommended)
GOOGLE_SEARCH_API_KEY=...                # Google Custom Search JSON API
GOOGLE_SEARCH_ENGINE_ID=...              # needed together with GOOGLE_SEARCH_API_KEY
TAVILY_API_KEY=...                       # Tavily fallback
```

```bash
npx wrangler secret put SERPER_API_KEY
```

Without a key, Allma says live search is unavailable and does not pretend to have searched. Results are biased to Uganda (`gl=ug`). Code: `src/lib/google-search.server.ts`, `src/lib/web-search-intent.ts`, `web_search` tool in `src/routes/api/chat.ts`, chips in `src/components/allma/web-search-card.tsx`.
