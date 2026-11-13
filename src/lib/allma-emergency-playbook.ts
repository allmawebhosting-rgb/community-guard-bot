// Emergency playbook: one source of truth for how Allma handles each incident.
// Only the matched incident's section (plus the universal flow) is sent to the
// model, so the prompt stays small.

export type HelpType = "hospital" | "police" | "fire";
export type IncidentCategory = "medical" | "crime" | "disaster";
export type EmergencyMarkerType = "medical" | "crime" | "fire";

export type Incident = {
  id: string;
  label: string;
  keywords: RegExp;
  category: IncidentCategory;
  helpTypes: HelpType[];
  lifeThreatening: boolean;
  /** Which emergency action block to show (::emergency{type=…}). */
  marker: EmergencyMarkerType;
  followUp: string;
  followUpChips: string[];
  /** Steps → red flags → notes, as compact prompt text. */
  guide: string;
};

const NOT_DOCTOR = "Allma isn't a doctor — if it gets worse, get medical help right away.";

// ORDER MATTERS: specific incidents come before general ones
// (road accident before bleeding, nosebleed before bleeding, gas leak before fire, sexual assault before assault).
export const INCIDENTS: Incident[] = [
  // ── Accidents first: they combine injury + police ──
  { id: "road_accident", label: "Road / boda boda accident", category: "disaster", marker: "medical", helpTypes: ["hospital", "police"], lifeThreatening: true,
    keywords: /road accident|car accident|boda|motorcycle (crash|accident)|knocked (down|by)|hit by a (car|vehicle|boda|taxi|truck)|crash(ed)?\b|collision|accident on the road|\baccident\b/i,
    followUp: "Is anyone badly hurt?", followUpChips: ["Yes, badly hurt", "No, minor injuries"],
    guide: "Steps: make the scene safe (hazard lights, warn traffic); call 999/112; don't move the injured unless there is fire or traffic danger; NEVER remove a rider's helmet; press firmly on any bleeding; keep them warm and talking; note number plates. Red flags: not breathing, unconscious, heavy bleeding, neck/back pain, trapped." },
  { id: "gas_leak", label: "Gas leak", category: "disaster", marker: "fire", helpTypes: ["fire"], lifeThreatening: true,
    keywords: /gas leak|smell(s|ing)? (of )?gas|gas cylinder (leak|hiss)/i,
    followUp: "Are you outside now?", followUpChips: ["Yes, I'm outside", "No, still inside"],
    guide: "Steps: no light switches, flames, matches or phone use near the leak; open doors and windows; turn off the cylinder valve only if safe; leave and call from outside. Red flags: dizziness, headache, someone collapsed, hissing sound." },
  { id: "building_collapse", label: "Building collapse", category: "disaster", marker: "fire", helpTypes: ["fire", "hospital"], lifeThreatening: true,
    keywords: /building (collapse|fell|came down)|collapsed building|trapped (under|in) (rubble|building)|rubble/i,
    followUp: "Is anyone trapped?", followUpChips: ["Yes, someone trapped", "No one trapped"],
    guide: "Steps: get out if you can, don't use lifts; if trapped, cover your mouth, tap on pipes or walls, don't shout constantly; call 112/999; don't re-enter. Red flags: people trapped, bleeding, trouble breathing, gas smell." },
  { id: "fire", label: "Fire", category: "disaster", marker: "fire", helpTypes: ["fire"], lifeThreatening: true,
    keywords: /\bfire\b|on fire|burning (house|building|car)|smoke|explosion/i,
    followUp: "Is everyone out safely?", followUpChips: ["Yes, everyone's out", "No, someone's inside"],
    guide: "Steps: get everyone out; stay low under smoke; close doors behind you; don't use lifts; never go back inside; call 112/999; no water on oil or electrical fires (smother oil with a lid or damp cloth). If anyone is burned or hurt, also search hospital. Red flags: someone trapped, smoke inhaled, burns." },
  { id: "flood", label: "Flood", category: "disaster", marker: "crime", helpTypes: ["police", "hospital"], lifeThreatening: true,
    keywords: /flood|water (is )?rising|swept away/i,
    followUp: "Are you on higher ground?", followUpChips: ["Yes, I'm safe", "No, still in water"],
    guide: "Steps: move to higher ground; never walk or drive through moving water; switch off power only if safe; avoid floodwater (disease, live wires). Red flags: someone swept away, trapped on a roof, injured." },
  { id: "landslide", label: "Landslide", category: "disaster", marker: "crime", helpTypes: ["police", "hospital"], lifeThreatening: true,
    keywords: /landslide|mudslide|mud slide/i,
    followUp: "Are you away from the slope?", followUpChips: ["Yes, I'm safe", "No, still near it"],
    guide: "Steps: move away from the slide path to higher, stable ground; listen for rumbling; avoid river valleys; warn neighbours; don't go back. Red flags: people buried, injured, more movement." },
  { id: "lightning", label: "Lightning strike", category: "disaster", marker: "medical", helpTypes: ["hospital"], lifeThreatening: true,
    keywords: /lightning|struck by thunder/i,
    followUp: "Is the person breathing?", followUpChips: ["Yes, breathing", "No, not breathing"],
    guide: "Steps: get inside a solid building or a car; avoid trees, open fields, water and metal; crouch low if caught outside. Lightning victims are safe to touch — start hands-only CPR if not breathing. Red flags: not breathing, burns, confusion." },

  // ── Crime / personal safety ──
  { id: "break_in", label: "Break-in / intruder", category: "crime", marker: "crime", helpTypes: ["police"], lifeThreatening: true,
    keywords: /break(ing)?[- ]in|broke in|intruder|someone (is )?in my (house|home|room)|burglar|breaking into/i,
    followUp: "Are you safe right now?", followUpChips: ["Yes, I'm safe", "No, I'm in danger"],
    guide: "Steps: don't confront them; go to a room you can lock; stay quiet and silence your phone; call 999 or press SOS (it shares your location with your Safety Circle); don't go out to check; leave through a safe exit only if you can do it safely." },
  { id: "sexual_assault", label: "Sexual assault", category: "crime", marker: "crime", helpTypes: ["hospital", "police"], lifeThreatening: false,
    keywords: /rape|raped|sexual(ly)? (assault|abuse|harass)|defile/i,
    followUp: "Are you somewhere safe now?", followUpChips: ["Yes, I'm safe", "No, not safe"],
    guide: "VERY gentle tone. Your safety first; it's not your fault. Go to a hospital within 72 hours (emergency contraception, HIV prevention/PEP, evidence). If possible, try not to bathe, change or wash clothes before the exam; keep clothes in a paper bag. Report to police when ready; an anonymous report is possible here." },
  { id: "domestic_violence", label: "Domestic violence", category: "crime", marker: "crime", helpTypes: ["police", "hospital"], lifeThreatening: false,
    keywords: /domestic violence|my (husband|wife|partner|boyfriend|girlfriend|father|mother|uncle) (beat|hit|hurt|threaten)|beating me|beat(en)? me|abusive (husband|wife|partner)/i,
    followUp: "Is it safe to talk right now?", followUpChips: ["Yes, safe to talk", "No, not safe"],
    guide: "FIRST ask if it's safe to talk and whether the abuser can see the phone. Safety plan: where to go, who to call, documents and money ready. Get a medical record of injuries. Police Child and Family Protection Unit handles these cases. Anonymous report option. NEVER suggest confronting the abuser or going home to talk." },
  { id: "kidnapping", label: "Kidnapping / missing child", category: "crime", marker: "crime", helpTypes: ["police"], lifeThreatening: true,
    keywords: /kidnap|abduct|missing (child|kid|son|daughter)|lost child|can'?t find my (child|son|daughter|kid)|found a (lost )?child/i,
    followUp: "When were they last seen?", followUpChips: ["Under 1 hour ago", "More than 1 hour"],
    guide: "Steps: report to police immediately (NO 24-hour wait); search the last place seen and nearby; share a recent photo and clothing description; alert school, neighbours, boda riders. If the user FOUND a lost child: keep them in a safe public place, don't take them home, contact police." },
  { id: "being_followed", label: "Being followed", category: "crime", marker: "crime", helpTypes: ["police"], lifeThreatening: true,
    keywords: /being followed|someone (is )?following me|followed me|stalk/i,
    followUp: "Are you safe right now?", followUpChips: ["Yes, I'm safe", "No, still followed"],
    guide: "Steps: go to a busy, lit place, shop, petrol station or police post; don't go home; call someone and share your live location; press SOS if they keep following." },
  { id: "robbery", label: "Robbery", category: "crime", marker: "crime", helpTypes: ["police"], lifeThreatening: false,
    keywords: /rob(bed|bery|bing)|mugg|snatch|held up|at gunpoint|at knifepoint/i,
    followUp: "Are you hurt?", followUpChips: ["Yes, I'm hurt", "No, I'm okay"],
    guide: "Steps: don't resist — hand over items, your life matters more; note face, clothing, direction, boda/vehicle plate; get to a safe busy place; then block your SIM and mobile money. If injured, also search hospital." },
  { id: "mob_violence", label: "Mob violence", category: "crime", marker: "crime", helpTypes: ["police"], lifeThreatening: true,
    keywords: /\bmob\b|mob justice|crowd (is )?beating|lynch|riot/i,
    followUp: "Are you away from the crowd?", followUpChips: ["Yes, I'm away", "No, still near"],
    guide: "Steps: leave the area; don't film or join in; if someone is being attacked, call 999 from a safe distance. NEVER encourage mob justice." },
  { id: "assault", label: "Assault / attack", category: "crime", marker: "crime", helpTypes: ["police", "hospital"], lifeThreatening: true,
    keywords: /assault|(?<!(heart|panic|asthma) )attack(ed|ing)?|stab|shot|shoot|gun|knife|machete|beaten|threaten/i,
    followUp: "Are you safe right now?", followUpChips: ["Yes, I'm safe", "No, I'm in danger"],
    guide: "Steps: get to safety; treat injuries (press on bleeding); get a medical record; keep torn or bloody clothes unwashed; report the same day." },
  { id: "scam", label: "Scam / fraud", category: "crime", marker: "crime", helpTypes: ["police"], lifeThreatening: false,
    keywords: /scam|fraud|conned|fake (agent|transaction)|sent money to (the )?wrong|mobile money (scam|fraud|stolen)/i,
    followUp: "Did you call your network?", followUpChips: ["Yes, I called", "Not yet"],
    guide: "Steps: stop sending money; call the network's official line to freeze/reverse the mobile money transaction; change PIN and passwords; keep transaction IDs and screenshots; report to police." },

  // ── Medical (specific before general) ──
  { id: "not_breathing", label: "Not breathing / CPR", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: true,
    keywords: /not breathing|stopped breathing|no pulse|cpr|cardiac arrest|heart stopped/i,
    followUp: "Is someone doing CPR?", followUpChips: ["Yes, doing CPR", "No, need help"],
    guide: "Steps: call 112/999 or get someone to; hands-only CPR — heel of the hand on the centre of the chest, push hard and fast (about 100–120 per minute, 5–6 cm deep); don't stop until help arrives or they breathe; use an AED if available." },
  { id: "choking", label: "Choking", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: true,
    keywords: /chok/i,
    followUp: "Is it an adult or a baby?", followUpChips: ["Adult or child", "Baby under 1"],
    guide: "Adult/older child: up to 5 back blows between the shoulder blades, then up to 5 abdominal thrusts; repeat. Infant (<1 yr): face-down along your forearm, 5 back blows, then 5 chest thrusts with two fingers — NO abdominal thrusts. If they become unresponsive, start CPR." },
  { id: "nosebleed", label: "Nosebleed", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: false,
    keywords: /nose ?-?bleed|bleed(ing|s)? (from |out of )?(the |my |his |her |their |a |our )?(child'?s |baby'?s |son'?s |daughter'?s )?nose|nose (is |keeps |won'?t stop |has been |started )?bleed|blood (is )?(coming |pouring |dripping )?(from|out of) (the |my |his |her |their )?nose|bloody nose/i,
    followUp: "Did the bleeding stop?", followUpChips: ["Yes, it stopped", "No, still bleeding"],
    guide: "Steps: sit up and lean FORWARD (never tilt the head back); pinch the soft part of the nose continuously for 10–15 min; breathe through the mouth; cold compress on the bridge of the nose; spit out blood, don't swallow; no blowing the nose for some hours. Red flags: still bleeding after 20 min, after a head injury, very heavy or trouble breathing, on blood thinners, dizzy/faint." },
  { id: "snake_bite", label: "Snake bite", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: true,
    keywords: /snake/i,
    followUp: "How long ago was the bite?", followUpChips: ["Just now", "Over 30 minutes"],
    guide: "Steps: keep still and calm; keep the limb still and below heart level; remove rings/watch; note the time and the snake's look (photo only if safe); get to hospital fast. NEVER cut, suck, tie, ice or apply herbs." },
  { id: "animal_bite", label: "Dog / animal bite", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: false,
    keywords: /dog bit|bitten by a? ?(dog|monkey|bat|cat|animal)|(dog|animal|monkey|bat) bite/i,
    followUp: "Is the wound deep?", followUpChips: ["Yes, it's deep", "No, small wound"],
    guide: "Steps: wash the wound with soap and running water for 15 min; cover with a clean cloth; go to a health facility the same day for rabies vaccine and tetanus. Red flags: deep wound, face/hands, unknown or strange-acting animal, any bat or monkey bite." },
  { id: "allergy", label: "Severe allergic reaction", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: true,
    keywords: /allerg|anaphyla|swollen (face|lips|tongue|throat)|lips (are )?swelling|epipen/i,
    followUp: "Can they breathe okay?", followUpChips: ["Yes, breathing", "No, struggling"],
    guide: "Steps: use their adrenaline auto-injector if they have one; keep them sitting up (or lying with legs raised if faint); go to hospital now." },
  { id: "asthma", label: "Asthma attack", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: false,
    keywords: /asthma|inhaler|wheez/i,
    followUp: "Is the inhaler helping?", followUpChips: ["Yes, it's helping", "No, not helping"],
    guide: "Steps: sit upright; use their reliever inhaler as their plan says; slow breaths; loosen clothing. Red flags: can't speak full sentences, lips blue, inhaler not helping." },
  { id: "heart_attack", label: "Heart attack", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: true,
    keywords: /heart attack|chest (pain|pressure|tight)|pain (in|to) (my |the )?(left )?arm and/i,
    followUp: "Is the pain still there?", followUpChips: ["Yes, still pain", "It's easing"],
    guide: "Signs: chest pain/pressure, pain to arm or jaw, sweating, breathless. Steps: stop all activity, sit them down, loosen clothing, get to hospital immediately; don't let them drive themselves." },
  { id: "stroke", label: "Stroke", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: true,
    keywords: /stroke|face (is )?droop|slurred speech|one side (is )?weak/i,
    followUp: "When did symptoms start?", followUpChips: ["Just now", "Over an hour ago"],
    guide: "FAST: Face drooping, Arm weakness, Speech slurred, Time to get help. Note the time symptoms started; nothing to eat or drink; go to hospital now." },
  { id: "seizure", label: "Seizure", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: false,
    keywords: /seizure|convuls|having a fit|fitting|epilep/i,
    followUp: "Has the seizure stopped?", followUpChips: ["Yes, it stopped", "No, still going"],
    guide: "Steps: move hard objects away; cushion the head; time it; NOTHING in the mouth; don't hold them down; recovery position when it stops. Red flags: lasts over 5 min, repeated seizures, first seizure, injury, pregnant, not waking." },
  { id: "poisoning", label: "Poisoning / overdose", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: true,
    keywords: /poison|overdose|swallowed (paraffin|bleach|chemical|pills|tablets)|drank (paraffin|bleach|poison)/i,
    followUp: "Are they awake and alert?", followUpChips: ["Yes, alert", "No, drowsy"],
    guide: "Steps: DON'T induce vomiting; keep the container or substance; if on skin/eyes rinse with water for 15+ min; recovery position if drowsy; go to hospital. Life-threatening if drowsy or breathing problems." },
  { id: "drowning", label: "Drowning", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: true,
    keywords: /drown/i,
    followUp: "Are they breathing?", followUpChips: ["Yes, breathing", "No, not breathing"],
    guide: "Steps: don't jump in unless trained; reach or throw something; once out, check breathing — start CPR if not breathing, recovery position if breathing; keep warm; always go to hospital." },
  { id: "electric_shock", label: "Electric shock", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: true,
    keywords: /electric(al)? shock|electrocut|shocked by (a |the )?(wire|power)/i,
    followUp: "Is the power off?", followUpChips: ["Yes, power off", "No, not yet"],
    guide: "Steps: don't touch them until the power is off; switch off at the mains or push them away with dry wood/plastic; check breathing — CPR if needed; treat burns; go to hospital." },
  { id: "labour", label: "Labour / pregnancy emergency", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: true,
    keywords: /labou?r|giving birth|baby (is )?coming|contractions|water (has )?broke|pregnan/i,
    followUp: "Is the baby coming now?", followUpChips: ["Yes, baby coming", "No, not yet"],
    guide: "Go to hospital now for: heavy bleeding, severe belly pain, fits, severe headache/blurred vision, water broken early, baby not moving. If birth is imminent: clean hands and cloths, support the baby, keep the baby warm skin-to-skin, don't pull the cord." },
  { id: "burn", label: "Burn", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: false,
    keywords: /burn(ed|t|s)?\b|scald/i,
    followUp: "Is the burn bigger than a palm?", followUpChips: ["Yes, it's large", "No, it's small"],
    guide: "Steps: cool under cool running water for 20 min; remove rings/tight items unless stuck; cover loosely with cling film or a clean non-fluffy cloth; NO ice, butter, oil or toothpaste; don't burst blisters. Red flags: large area, face/hands/genitals, electrical or chemical burn, child or elderly, white or charred skin." },
  { id: "head_injury", label: "Head injury", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: false,
    keywords: /head injur|hit (my |his |her |their )?head|knocked out|concussion/i,
    followUp: "Did they lose consciousness?", followUpChips: ["Yes, knocked out", "No, awake"],
    guide: "Steps: keep them still; cold pack; watch closely for 24 hours. Red flags: knocked out, vomiting, confusion, drowsiness, fluid from ears/nose, unequal pupils, seizure, worsening headache." },
  { id: "fracture", label: "Fracture", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: false,
    keywords: /fracture|broken (leg|arm|bone|wrist|ankle)|bone (is )?(sticking|out)/i,
    followUp: "Is the skin broken?", followUpChips: ["Yes, bone showing", "No, skin intact"],
    guide: "Steps: keep the limb still in the position found; support it; cold pack wrapped in cloth; don't try to straighten it. Red flags: bone through skin, cold or blue limb, neck/back/thigh injury (don't move them)." },
  { id: "heat_stroke", label: "Heat stroke", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: true,
    keywords: /heat ?stroke|heat exhaustion|overheat/i,
    followUp: "Are they awake and alert?", followUpChips: ["Yes, alert", "No, confused"],
    guide: "Steps: move to shade; cool with water and fanning; loosen clothing; sips of water only if fully awake. Red flags: confusion, collapse, not sweating, seizure." },
  { id: "unconscious", label: "Fainting / unconscious", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: true,
    keywords: /unconscious|faint|passed out|collaps|unresponsive|won'?t wake/i,
    followUp: "Are they breathing normally?", followUpChips: ["Yes, breathing", "No, not breathing"],
    guide: "Steps: check breathing; recovery position (on their side, head tilted back to keep the airway open); loosen tight clothing; nothing by mouth; stay with them. If not breathing, start CPR. Red flags: not waking, not breathing normally, after a fall or head injury, pregnant, diabetic." },
  { id: "bleeding", label: "Severe bleeding", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: true,
    keywords: /bleed|blood|deep cut|wound|gash/i,
    followUp: "Did the bleeding stop?", followUpChips: ["Yes, it stopped", "No, still bleeding"],
    guide: "Steps: firm direct pressure with a clean cloth; don't lift to check; add more cloth on top if it soaks through; raise the limb if no fracture; keep them warm. Tourniquet ONLY for life-threatening limb bleeding that pressure can't control and the person knows how. Red flags: spurting blood, won't stop after 10 min of pressure, pale/cold/confused." },
  { id: "fever_malaria", label: "High fever / malaria signs", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: false,
    keywords: /fever|malaria|chills|high temperature/i,
    followUp: "Is it a child under 5?", followUpChips: ["Yes, under 5", "No, older"],
    guide: "Steps: light clothing; fluids; sponge with lukewarm water; get a malaria test at a health facility today. Red flags: convulsions, very sleepy/unresponsive, can't drink, fast breathing, dark urine, yellow eyes, child under 5." },
  { id: "mental_health", label: "Mental health crisis", category: "medical", marker: "medical", helpTypes: ["hospital"], lifeThreatening: true,
    keywords: /suicid|kill myself|end my life|want to die|self[- ]harm|hurt myself|no reason to live/i,
    followUp: "Are you safe right now?", followUpChips: ["Yes, I'm safe", "No, I'm not safe"],
    guide: "Be compassionate and non-judgemental; thank them for telling you; ask if they are safe right now; encourage them to reach a trusted person now and to call 999/112 or go to a hospital if in immediate danger; suggest removing means of harm if safe; stay with them in the chat. Do NOT add the 'not a doctor' line — close gently instead (e.g. 'I'm here with you.'). No support line other than 999/112." },
];

/** Structured first-aid content parsed from an incident's guide (for a guaranteed on-screen fallback). */
export type FirstAid = { steps: string[]; redFlags: string[]; notDoctor: string | null };

export const NOT_DOCTOR_LINE = NOT_DOCTOR;

function cap(s: string) {
  const t = s.trim().replace(/[.;,]+$/, "");
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

export function firstAidFor(incident: Incident): FirstAid | null {
  const g = incident.guide;
  const stepsMatch = /Steps:\s*([\s\S]*?)(?:\.\s|\.$|$|Red flags:)/.exec(g);
  if (!stepsMatch) return null;
  const steps = stepsMatch[1].split(";").map(cap).filter(Boolean).slice(0, 6);
  if (!steps.length) return null;
  const flagsMatch = /Red flags:\s*([^.]*)/.exec(g);
  const redFlags = flagsMatch ? flagsMatch[1].split(",").map(cap).filter(Boolean).slice(0, 6) : [];
  const notDoctor = incident.category === "medical" && incident.id !== "mental_health" ? NOT_DOCTOR : null;
  return { steps, redFlags, notDoctor };
}

/** Place and service names that look like incidents but aren't ("fire station", "blood bank"). */
const NOT_AN_INCIDENT = /\bfire (?:station|brigade|service|department|and rescue|& rescue|extinguisher)s?\b|\bblood (?:bank|test|donation|group|pressure)s?\b|\baccident (?:and|&) emergency\b/gi;

export function matchIncident(text: string): Incident | null {
  const cleaned = text.replace(NOT_AN_INCIDENT, " ");
  if (!cleaned.trim()) return null;
  return INCIDENTS.find((i) => i.keywords.test(cleaned)) ?? null;
}

export const ALLMA_EMERGENCY_PLAYBOOK = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EMERGENCY PLAYBOOK — UNIVERSAL FLOW (one reply, this order)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1) Judge severity silently. Ask at most ONE short clarifying question, only if truly needed for safe advice.
2) If potentially life-threatening: put ::emergency{type=<medical|crime|fire>} on its own FIRST line. It renders a red "Press SOS" button and separate Call 999 (Police) / Call 112 (Toll-free) buttons. Never write the numbers run together on one line — if you write numbers in text, each goes on its own "- " line. Never say you started SOS; the user taps it.
3) Steps: a numbered list (1. 2. 3.), max 6 items, ONE per line, simple calm English. ALWAYS write the steps and the red flags in your text BEFORE you call find_facilities, and never write them a second time after the results.
4) "**Get help now if:**" then a short "- " list of red flags.
5) Nearest help: call find_facilities in THIS reply for the correct type(s) only (one call per type). A town the user named beats GPS; never assume Kampala. If no location at all, ask in one short line and add ::media{type=location}. The place cards show the results — if you name a place in text, use ONLY a name from that find_facilities result with its exact distance_km; never name any other hospital, station, city or distance.
6) Finish with the follow-up question and a ::suggest[…] line of 2 short Yes/No-style chips (each ≤ 22 characters).
Medical replies (except mental health) end with exactly this line before the chips: "${NOT_DOCTOR}"
NEVER: tilt the head back for a nosebleed; induce vomiting; tourniquet unless life-threatening limb bleeding pressure can't control and they know how; cut/suck/ice/tie a snake bite; butter/oil/toothpaste/ice on burns; anything in a seizing person's mouth; remove a crash victim's helmet; name medicines or doses. Numbers: Police 999, Toll-free emergency 112 (also for an ambulance). NEVER mention 911 — it is not a Ugandan number. Never invent any other number, station or response time. Never claim anyone was contacted or that help is coming. Never write filler or narration about what you are doing ("Let me arrange the local help details", "Let me find…", "Now, …") — just call the tool and continue.`;

/** The universal flow plus ONLY the matched incident's section. */
export function playbookPromptFor(incident: Incident): string {
  const help = incident.helpTypes.map((h) => `facility_type="${h}"`).join(" AND ");
  return `${ALLMA_EMERGENCY_PLAYBOOK}

MATCHED INCIDENT: ${incident.label} (${incident.category}${incident.lifeThreatening ? ", potentially life-threatening → start with ::emergency{type=" + incident.marker + "}" : ", not usually life-threatening → only add ::emergency{type=" + incident.marker + "} if the details sound severe"}).
${incident.guide}
Nearest help: call find_facilities with ${help}.
Follow-up: "${incident.followUp}" ::suggest[${incident.followUpChips.join(" | ")}]`;
}
