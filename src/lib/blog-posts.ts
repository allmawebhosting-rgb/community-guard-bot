export type BlogPost = {
  slug: string;
  keyword: string;
  category: string;
  title: string;
  excerpt: string;
  readMinutes: number;
  publishedAt: string;
  accent: string;
  author: string;
  featuredImage: string;
  sections: Array<{ heading: string; paragraphs: string[]; bullets?: string[] }>;
};

type PostSeed = {
  keyword: string;
  category: string;
  title: string;
  excerpt: string;
  angle: string;
  checks: string[];
  accent: string;
  author: string;
  image: string;
};

const articleImages = [
  "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1556157382-97eda2d62296?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80",
];

const seeds: PostSeed[] = [
  { keyword: "Allma Safety AI", category: "Allma guide", title: "Allma Safety AI: a practical guide to calmer emergency decisions", excerpt: "How an AI safety companion can help people move from uncertainty to a clear, consent-led response in Uganda.", angle: "A safety tool should make the next safe action easier without pretending to replace people, police, clinicians or emergency operators.", checks: ["Keep your emergency profile current", "Choose trusted contacts who can answer", "Review what location and contact data each action shares"], accent: "red", author: "Allma Safety Team", image: articleImages[0] },
  { keyword: "emergency SOS app", category: "Emergency basics", title: "Emergency SOS apps: what to check before you need one", excerpt: "A buyer's guide to SOS activation, contact escalation, location sharing and the details that matter under pressure.", angle: "The best SOS experience is fast at the moment of danger and transparent about what happens after the button is pressed.", checks: ["Test activation without creating a false alarm", "Confirm how contacts are notified", "Save official emergency numbers separately"], accent: "gold", author: "Allma Safety Team", image: articleImages[1] },
  { keyword: "personal safety app", category: "Personal safety", title: "Personal safety apps: choosing tools that work beyond the panic button", excerpt: "Compare check-ins, trusted networks, live location, chat and incident records when planning everyday personal safety.", angle: "Personal safety is a chain of small decisions, not one dramatic feature. Look for tools that support preparation as well as response.", checks: ["Set a simple check-in routine", "Use privacy controls deliberately", "Keep the app and phone permissions updated"], accent: "blue", author: "Allma Safety Team", image: articleImages[2] },
  { keyword: "Uganda safety app", category: "Uganda", title: "Uganda safety apps: a local checklist for choosing the right support", excerpt: "What to look for in a Uganda-focused safety app, from local services and connectivity to trusted contacts and clear escalation.", angle: "A useful Uganda safety app should understand local places, local numbers and real travel conditions rather than simply reusing a generic global template.", checks: ["Verify local emergency information", "Check whether nearby places include addresses and phones", "Plan for weak data or delayed notifications"], accent: "green", author: "Allma Safety Team", image: articleImages[3] },
  { keyword: "emergency response app", category: "Emergency response", title: "Emergency response apps: how digital coordination should work", excerpt: "A clear look at alerts, response paths, location context and human confirmation in a modern emergency workflow.", angle: "Coordination is valuable when it reduces duplicated calls, gives people the same facts and leaves final high-risk decisions with humans.", checks: ["Show the current response status", "Separate official calls from community help", "Record important updates in one place"], accent: "red", author: "Allma Safety Team", image: articleImages[4] },
  { keyword: "community safety platform", category: "Community safety", title: "Community safety platforms: building help without creating new risk", excerpt: "How trusted communities can support people in danger while protecting privacy and discouraging unsafe confrontation.", angle: "Community safety works best when participation is consent-based, roles are clear and nobody is pressured to intervene physically.", checks: ["Use verified or opted-in contacts", "Share the least information needed", "Give responders a clear do-not-confront rule"], accent: "blue", author: "Allma Safety Team", image: articleImages[5] },
  { keyword: "live SOS alerts", category: "Alerts", title: "Live SOS alerts: what a useful alert should tell a trusted contact", excerpt: "The essential ingredients of an SOS alert, including urgency, location consent, identity context and a way to respond.", angle: "An alert is not just a notification. It is the opening message in a live response, so its meaning and next action should be obvious.", checks: ["Include a readable emergency type", "Show whether location is shared", "Provide an in-app way to acknowledge or reply"], accent: "gold", author: "Allma Safety Team", image: articleImages[6] },
  { keyword: "emergency location sharing", category: "Location safety", title: "Emergency location sharing: useful, temporary and consent-led", excerpt: "How to share enough location context for help without turning an emergency into permanent exposure.", angle: "Location can shorten the path to help, but good design makes consent, accuracy, recipients and stopping conditions visible.", checks: ["Tell people who receives the location", "Label precise versus approximate fixes", "Stop sharing when the emergency ends"], accent: "green", author: "Allma Safety Team", image: articleImages[7] },
  { keyword: "GPS emergency tracking", category: "Location safety", title: "GPS emergency tracking: accuracy, battery and the human context", excerpt: "What GPS can and cannot do during an emergency, and how to interpret accuracy instead of treating a pin as certainty.", angle: "A GPS point is evidence with uncertainty. The best response combines the coordinates with landmarks, timing and a person who can clarify the situation.", checks: ["Show the accuracy radius", "Refresh location only when useful", "Ask for a landmark when GPS is weak"], accent: "blue", author: "Allma Safety Team", image: articleImages[0] },
  { keyword: "nearby hospitals", category: "Nearby help", title: "Nearby hospitals: finding the right emergency destination faster", excerpt: "A practical guide to comparing nearby hospitals by distance, address, phone availability, directions and current confidence.", angle: "The closest place is not always the right place, but a verified list removes the first layer of searching when every minute matters.", checks: ["Confirm the address before travelling", "Call when the situation allows", "Use directions from the current shared location"], accent: "green", author: "Allma Safety Team", image: articleImages[1] },
  { keyword: "nearby police stations", category: "Nearby help", title: "Nearby police stations: what to confirm before you go", excerpt: "Use nearby police search results as a starting point, then confirm the station, route and official contact details.", angle: "A map result can orient you, but it should not be treated as proof that a station is open, staffed or able to receive a specific case.", checks: ["Check the official number where available", "Share the route with a trusted person", "Avoid approaching a dangerous scene alone"], accent: "blue", author: "Allma Safety Team", image: articleImages[2] },
  { keyword: "nearby clinics", category: "Nearby help", title: "Nearby clinics: choosing urgent care close to you", excerpt: "How to use clinic listings responsibly when you need quick care, advice or a referral in Uganda.", angle: "Clinics can be useful for urgent assessment, but the right choice depends on symptoms, opening status, capability and safe transport.", checks: ["Read the facility type carefully", "Call to confirm services and hours", "Use emergency services for life-threatening symptoms"], accent: "green", author: "Allma Safety Team", image: articleImages[3] },
  { keyword: "emergency services Uganda", category: "Uganda", title: "Emergency services in Uganda: prepare the numbers and the route", excerpt: "A preparation guide for official services, local facilities, trusted contacts and the digital tools that connect them.", angle: "The strongest emergency plan has more than one route to help: official services, a trusted human network and clear local place information.", checks: ["Save official numbers offline", "Know your district and nearest landmark", "Keep a charged phone and backup contact"], accent: "red", author: "Allma Safety Team", image: articleImages[4] },
  { keyword: "Kampala emergency help", category: "Kampala", title: "Kampala emergency help: a calm plan for the first ten minutes", excerpt: "What to do first when you need emergency help in Kampala, from securing your immediate safety to sharing useful location context.", angle: "The first ten minutes are about reducing exposure, communicating clearly and choosing the safest available route to qualified help.", checks: ["Move toward a staffed, safer place when possible", "Share a landmark and district", "Use the nearest verified facility list as a guide"], accent: "gold", author: "Allma Safety Team", image: articleImages[5] },
  { keyword: "Uganda police contacts", category: "Uganda", title: "Uganda police contacts: keeping official information usable", excerpt: "How to organise police contacts, station details and emergency context so a call becomes easier to act on.", angle: "Contact information only helps when it is current, readable and paired with the facts an operator needs to understand the situation.", checks: ["Prefer official or verified sources", "Write down the incident location", "Do not rely on a single saved number"], accent: "blue", author: "Allma Safety Team", image: articleImages[6] },
  { keyword: "Uganda hospitals directory", category: "Uganda", title: "Uganda hospitals directory: compare facilities with care", excerpt: "A practical way to use hospital directories without confusing a listing with a guarantee of beds, specialists or opening status.", angle: "Directories are valuable for orientation and planning, but a phone confirmation remains important for urgent or specialised care.", checks: ["Compare distance and route", "Check the facility category", "Confirm the phone and current availability"], accent: "green", author: "Allma Safety Team", image: articleImages[7] },
  { keyword: "Google Maps emergency locations", category: "Maps", title: "Google Maps emergency locations: using maps without losing judgment", excerpt: "How maps help with emergency orientation, directions and facility discovery while keeping uncertainty visible.", angle: "A map is a decision aid, not a dispatcher. Use it to understand options, then verify the place and choose the safest route.", checks: ["Check the pin against the written address", "Use live directions carefully", "Keep a human contact informed of your route"], accent: "blue", author: "Allma Safety Team", image: articleImages[0] },
  { keyword: "real-time safety network", category: "Safety network", title: "Real-time safety networks: turning trusted contacts into a response path", excerpt: "What makes a safety network responsive, respectful and useful when a person activates an SOS.", angle: "Real-time does not mean everyone sees everything. It means the right people receive the right context quickly enough to make a safe decision.", checks: ["Set contact priorities in advance", "Show real call or message status", "Protect member phone numbers and private details"], accent: "red", author: "Allma Safety Team", image: articleImages[1] },
  { keyword: "trusted emergency contacts", category: "Trusted contacts", title: "Trusted emergency contacts: choosing people who can really help", excerpt: "A guide to selecting, preparing and reviewing the people who may receive your emergency alerts.", angle: "Trust is practical: choose people who know how to reach you, can answer under pressure and understand your privacy boundaries.", checks: ["Ask before adding someone", "Explain what an SOS shares", "Review contacts after moves, job changes or new routines"], accent: "gold", author: "Allma Safety Team", image: articleImages[2] },
  { keyword: "safety network alerts", category: "Alerts", title: "Safety network alerts: designing notifications people can act on", excerpt: "Make emergency notifications concise, respectful and actionable for the people who receive them.", angle: "A good alert answers four questions quickly: who needs help, what kind of danger is involved, where is the person, and what can I do now?", checks: ["Use plain emergency language", "Make location consent visible", "Provide a clear reply or call action"], accent: "gold", author: "Allma Safety Team", image: articleImages[3] },
];

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export const BLOG_POSTS: BlogPost[] = seeds.map((seed, index) => ({
  slug: slugify(seed.keyword),
  keyword: seed.keyword,
  category: seed.category,
  title: seed.title,
  excerpt: seed.excerpt,
  readMinutes: 5 + (index % 4),
  publishedAt: "2026-09-08",
  accent: seed.accent,
  author: seed.author,
  featuredImage: seed.image,
  sections: [
    { heading: "The practical answer", paragraphs: [seed.angle, seed.excerpt + " The useful question is not whether a feature sounds impressive; it is whether a person can understand and use it during a difficult moment."] },
    { heading: "What a responsible approach looks like", paragraphs: ["Start with immediate safety, then communicate with a trusted person or qualified service. Keep the information short, current and proportional to the situation. A well-designed safety workflow should make uncertainty visible instead of presenting a map pin, alert or automated suggestion as absolute certainty.", "For Uganda, local context matters. District names, landmarks, traffic, connectivity, facility capability and the difference between an official number and a community contact all affect the next decision."] },
    { heading: "A short checklist before you rely on it", paragraphs: ["Review these details before an emergency, and revisit them when your routine changes."], bullets: seed.checks },
  ],
}));

export function getBlogPost(slug: string) {
  return BLOG_POSTS.find((post) => post.slug === slug);
}
