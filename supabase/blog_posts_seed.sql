-- Allma Safety AI blog seed
-- Run this file in the Supabase SQL editor after selecting the project database.

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  keyword text not null,
  category text not null,
  title text not null,
  excerpt text not null,
  body_md text not null,
  read_minutes integer not null default 6 check (read_minutes > 0),
  published_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_posts_published_at_idx on public.blog_posts (published_at desc);

alter table public.blog_posts enable row level security;
drop policy if exists "Published blog posts are public" on public.blog_posts;
create policy "Published blog posts are public" on public.blog_posts for select using (published_at <= current_date);

insert into public.blog_posts (slug, keyword, category, title, excerpt, body_md, read_minutes, published_at)
values
('allma-safety-ai', 'Allma Safety AI', 'Allma guide', 'Allma Safety AI: a practical guide to calmer emergency decisions', 'How an AI safety companion can help people move from uncertainty to a clear, consent-led response in Uganda.', $$## The practical answer
A safety tool should make the next safe action easier without pretending to replace people, police, clinicians or emergency operators. Allma is designed around clear choices, trusted contacts, nearby help and honest status updates.

## What a responsible approach looks like
Start with immediate safety, then communicate with a trusted person or qualified service. Keep information short, current and proportional to the situation. For Uganda, district names, landmarks, connectivity and local facilities all affect the next decision.

## A short checklist
- Keep your emergency profile current.
- Choose trusted contacts who can answer.
- Review what location and contact data each action shares.$$ , 5, '2026-09-08'),
('emergency-sos-app', 'emergency SOS app', 'Emergency basics', 'Emergency SOS apps: what to check before you need one', 'A buyer''s guide to SOS activation, contact escalation, location sharing and the details that matter under pressure.', $$## The practical answer
The best SOS experience is fast at the moment of danger and transparent about what happens after the button is pressed. A useful app explains who is alerted, what location is shared and how the person can stop or update the session.

## What a responsible approach looks like
Test activation without creating a false alarm. Confirm how contacts are notified and save official emergency numbers separately. A panic button is only one part of a response plan.

## A short checklist
- Test activation safely.
- Confirm how contacts are notified.
- Save official emergency numbers separately.$$ , 6, '2026-09-08'),
('personal-safety-app', 'personal safety app', 'Personal safety', 'Personal safety apps: choosing tools that work beyond the panic button', 'Compare check-ins, trusted networks, live location, chat and incident records when planning everyday personal safety.', $$## The practical answer
Personal safety is a chain of small decisions, not one dramatic feature. Look for tools that support preparation as well as response, including check-ins, trusted networks and clear privacy controls.

## What a responsible approach looks like
Set a simple routine, use permissions deliberately and keep the app updated. Make sure the people in your network understand when an alert is serious and what they can realistically do.

## A short checklist
- Set a simple check-in routine.
- Use privacy controls deliberately.
- Keep the app and phone permissions updated.$$ , 5, '2026-09-08'),
('uganda-safety-app', 'Uganda safety app', 'Uganda', 'Uganda safety apps: a local checklist for choosing the right support', 'What to look for in a Uganda-focused safety app, from local services and connectivity to trusted contacts and clear escalation.', $$## The practical answer
A useful Uganda safety app should understand local places, local numbers and real travel conditions rather than reusing a generic global template. Local context makes an alert more actionable.

## What a responsible approach looks like
Verify local emergency information, check whether nearby places include addresses and phones, and plan for weak data or delayed notifications. No app should imply that digital coordination replaces official services.

## A short checklist
- Verify local emergency information.
- Check nearby place addresses and phones.
- Plan for weak data or delayed notifications.$$ , 6, '2026-09-08'),
('emergency-response-app', 'emergency response app', 'Emergency response', 'Emergency response apps: how digital coordination should work', 'A clear look at alerts, response paths, location context and human confirmation in a modern emergency workflow.', $$## The practical answer
Coordination is valuable when it reduces duplicated calls, gives people the same facts and leaves final high-risk decisions with humans. The interface should show what is happening without inventing progress.

## What a responsible approach looks like
Separate official calls from community help, show real response status and record important updates in one place. Make it clear when an action still requires a person''s tap.

## A short checklist
- Show the current response status.
- Separate official calls from community help.
- Record important updates in one place.$$ , 5, '2026-09-08'),
('community-safety-platform', 'community safety platform', 'Community safety', 'Community safety platforms: building help without creating new risk', 'How trusted communities can support people in danger while protecting privacy and discouraging unsafe confrontation.', $$## The practical answer
Community safety works best when participation is consent-based, roles are clear and nobody is pressured to intervene physically. Digital tools should connect people to safer choices, not create a crowd around danger.

## What a responsible approach looks like
Use verified or opted-in contacts, share the least information needed and give responders a clear do-not-confront rule. Escalate to official services when the situation requires authority or medical care.

## A short checklist
- Use verified or opted-in contacts.
- Share the least information needed.
- Give responders a clear do-not-confront rule.$$ , 6, '2026-09-08'),
('live-sos-alerts', 'live SOS alerts', 'Alerts', 'Live SOS alerts: what a useful alert should tell a trusted contact', 'The essential ingredients of an SOS alert, including urgency, location consent, identity context and a way to respond.', $$## The practical answer
An alert is not just a notification. It is the opening message in a live response, so its meaning and next action should be obvious.

## What a responsible approach looks like
Include a readable emergency type, show whether location is shared and provide an in-app way to acknowledge or reply. Avoid vague alerts that force the recipient to guess what happened.

## A short checklist
- Include a readable emergency type.
- Show whether location is shared.
- Provide a clear reply or call action.$$ , 5, '2026-09-08'),
('emergency-location-sharing', 'emergency location sharing', 'Location safety', 'Emergency location sharing: useful, temporary and consent-led', 'How to share enough location context for help without turning an emergency into permanent exposure.', $$## The practical answer
Location can shorten the path to help, but good design makes consent, accuracy, recipients and stopping conditions visible.

## What a responsible approach looks like
Tell people who receives the location, label precise versus approximate fixes and stop sharing when the emergency ends. A person should be able to continue safely when GPS is unavailable.

## A short checklist
- Tell people who receives the location.
- Label precise versus approximate fixes.
- Stop sharing when the emergency ends.$$ , 6, '2026-09-08'),
('gps-emergency-tracking', 'GPS emergency tracking', 'Location safety', 'GPS emergency tracking: accuracy, battery and the human context', 'What GPS can and cannot do during an emergency, and how to interpret accuracy instead of treating a pin as certainty.', $$## The practical answer
A GPS point is evidence with uncertainty. The best response combines coordinates with landmarks, timing and a person who can clarify the situation.

## What a responsible approach looks like
Show the accuracy radius, refresh location only when useful and ask for a landmark when GPS is weak. Tracking should not be presented as a guarantee of rescue.

## A short checklist
- Show the accuracy radius.
- Refresh location only when useful.
- Ask for a landmark when GPS is weak.$$ , 5, '2026-09-08'),
('nearby-hospitals', 'nearby hospitals', 'Nearby help', 'Nearby hospitals: finding the right emergency destination faster', 'A practical guide to comparing nearby hospitals by distance, address, phone availability, directions and current confidence.', $$## The practical answer
The closest place is not always the right place, but a verified list removes the first layer of searching when every minute matters.

## What a responsible approach looks like
Confirm the address before travelling, call when the situation allows and use directions from the current shared location. Listings are useful orientation, not a promise of a bed or specialist.

## A short checklist
- Confirm the address before travelling.
- Call when the situation allows.
- Use directions from the current shared location.$$ , 6, '2026-09-08'),
('nearby-police-stations', 'nearby police stations', 'Nearby help', 'Nearby police stations: what to confirm before you go', 'Use nearby police search results as a starting point, then confirm the station, route and official contact details.', $$## The practical answer
A map result can orient you, but it should not be treated as proof that a station is open, staffed or able to receive a specific case.

## What a responsible approach looks like
Check the official number where available, share the route with a trusted person and avoid approaching a dangerous scene alone. Contact authorities from a safer position when possible.

## A short checklist
- Check the official number where available.
- Share the route with a trusted person.
- Avoid approaching a dangerous scene alone.$$ , 5, '2026-09-08'),
('nearby-clinics', 'nearby clinics', 'Nearby help', 'Nearby clinics: choosing urgent care close to you', 'How to use clinic listings responsibly when you need quick care, advice or a referral in Uganda.', $$## The practical answer
Clinics can be useful for urgent assessment, but the right choice depends on symptoms, opening status, capability and safe transport.

## What a responsible approach looks like
Read the facility type carefully, call to confirm services and hours, and use emergency services for life-threatening symptoms. A nearby clinic is not automatically an emergency department.

## A short checklist
- Read the facility type carefully.
- Call to confirm services and hours.
- Use emergency services for life-threatening symptoms.$$ , 5, '2026-09-08'),
('emergency-services-uganda', 'emergency services Uganda', 'Uganda', 'Emergency services in Uganda: prepare the numbers and the route', 'A preparation guide for official services, local facilities, trusted contacts and the digital tools that connect them.', $$## The practical answer
The strongest emergency plan has more than one route to help: official services, a trusted human network and clear local place information.

## What a responsible approach looks like
Save official numbers offline, know your district and nearest landmark, and keep a charged phone and backup contact. Confirm important numbers from official sources.

## A short checklist
- Save official numbers offline.
- Know your district and nearest landmark.
- Keep a charged phone and backup contact.$$ , 6, '2026-09-08'),
('kampala-emergency-help', 'Kampala emergency help', 'Kampala', 'Kampala emergency help: a calm plan for the first ten minutes', 'What to do first when you need emergency help in Kampala, from securing immediate safety to sharing useful location context.', $$## The practical answer
The first ten minutes are about reducing exposure, communicating clearly and choosing the safest available route to qualified help.

## What a responsible approach looks like
Move toward a staffed, safer place when possible, share a landmark and district, and use the nearest verified facility list as a guide. Traffic and access can change quickly.

## A short checklist
- Move toward a staffed, safer place when possible.
- Share a landmark and district.
- Use verified facility directions as a guide.$$ , 5, '2026-09-08'),
('uganda-police-contacts', 'Uganda police contacts', 'Uganda', 'Uganda police contacts: keeping official information usable', 'How to organise police contacts, station details and emergency context so a call becomes easier to act on.', $$## The practical answer
Contact information only helps when it is current, readable and paired with the facts an operator needs to understand the situation.

## What a responsible approach looks like
Prefer official or verified sources, write down the incident location and do not rely on a single saved number. Keep a trusted contact informed when it is safe.

## A short checklist
- Prefer official or verified sources.
- Write down the incident location.
- Do not rely on a single saved number.$$ , 5, '2026-09-08'),
('uganda-hospitals-directory', 'Uganda hospitals directory', 'Uganda', 'Uganda hospitals directory: compare facilities with care', 'A practical way to use hospital directories without confusing a listing with a guarantee of beds, specialists or opening status.', $$## The practical answer
Directories are valuable for orientation and planning, but phone confirmation remains important for urgent or specialised care.

## What a responsible approach looks like
Compare distance and route, check the facility category and confirm the phone and current availability. Keep a second option in mind when the situation is urgent.

## A short checklist
- Compare distance and route.
- Check the facility category.
- Confirm the phone and current availability.$$ , 6, '2026-09-08'),
('google-maps-emergency-locations', 'Google Maps emergency locations', 'Maps', 'Google Maps emergency locations: using maps without losing judgment', 'How maps help with emergency orientation, directions and facility discovery while keeping uncertainty visible.', $$## The practical answer
A map is a decision aid, not a dispatcher. Use it to understand options, then verify the place and choose the safest route.

## What a responsible approach looks like
Check the pin against the written address, use live directions carefully and keep a human contact informed of your route. Do not assume that a map result confirms current operations.

## A short checklist
- Check the pin against the written address.
- Use live directions carefully.
- Keep a human contact informed of your route.$$ , 5, '2026-09-08'),
('real-time-safety-network', 'real-time safety network', 'Safety network', 'Real-time safety networks: turning trusted contacts into a response path', 'What makes a safety network responsive, respectful and useful when a person activates an SOS.', $$## The practical answer
Real-time does not mean everyone sees everything. It means the right people receive the right context quickly enough to make a safe decision.

## What a responsible approach looks like
Set contact priorities in advance, show real call or message status and protect member phone numbers and private details. Consent should remain visible throughout.

## A short checklist
- Set contact priorities in advance.
- Show real call or message status.
- Protect member phone numbers and private details.$$ , 6, '2026-09-08'),
('trusted-emergency-contacts', 'trusted emergency contacts', 'Trusted contacts', 'Trusted emergency contacts: choosing people who can really help', 'A guide to selecting, preparing and reviewing the people who may receive your emergency alerts.', $$## The practical answer
Trust is practical: choose people who know how to reach you, can answer under pressure and understand your privacy boundaries.

## What a responsible approach looks like
Ask before adding someone, explain what an SOS shares and review contacts after moves, job changes or new routines. A smaller prepared network is often better than a large inactive list.

## A short checklist
- Ask before adding someone.
- Explain what an SOS shares.
- Review contacts as your routine changes.$$ , 5, '2026-09-08'),
('safety-network-alerts', 'safety network alerts', 'Alerts', 'Safety network alerts: designing notifications people can act on', 'Make emergency notifications concise, respectful and actionable for the people who receive them.', $$## The practical answer
A good alert answers four questions quickly: who needs help, what kind of danger is involved, where is the person, and what can I do now?

## What a responsible approach looks like
Use plain emergency language, make location consent visible and provide a clear reply or call action. Never add a simulated responder or arrival status to make an alert feel more complete.

## A short checklist
- Use plain emergency language.
- Make location consent visible.
- Provide a clear reply or call action.$$ , 5, '2026-09-08');

on conflict (slug) do update set
  keyword = excluded.keyword,
  category = excluded.category,
  title = excluded.title,
  excerpt = excluded.excerpt,
  body_md = excluded.body_md,
  read_minutes = excluded.read_minutes,
  published_at = excluded.published_at,
  updated_at = now();

alter table public.blog_posts force row level security;
