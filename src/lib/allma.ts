export type QuickAction = {
  id: string;
  emoji: string;
  label: string;
  prompt: string;
  tone?: "urgent" | "default";
};

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "sos",
    emoji: "🚨",
    label: "Emergency SOS",
    prompt: "This is an emergency. I need help right now.",
    tone: "urgent",
  },
  {
    id: "crime",
    emoji: "🚔",
    label: "Report Crime",
    prompt: "I want to report a crime.",
  },
  {
    id: "missing",
    emoji: "👤",
    label: "Missing Person",
    prompt: "I need to report a missing person.",
  },
  {
    id: "lost",
    emoji: "🎒",
    label: "Lost & Found",
    prompt: "I want to report something lost or found.",
  },
  {
    id: "hospital",
    emoji: "🏥",
    label: "Find Hospital",
    prompt: "Find the nearest hospital.",
  },
  {
    id: "police",
    emoji: "👮",
    label: "Find Police Station",
    prompt: "Find the nearest police station.",
  },
  {
    id: "fire",
    emoji: "🚒",
    label: "Fire Emergency",
    prompt: "There is a fire. I need help.",
    tone: "urgent",
  },
  {
    id: "ambulance",
    emoji: "🚑",
    label: "Ambulance",
    prompt: "I need an ambulance.",
    tone: "urgent",
  },
  {
    id: "alerts",
    emoji: "📢",
    label: "Community Alerts",
    prompt: "Show me the latest community safety alerts near me.",
  },
  {
    id: "ask",
    emoji: "💬",
    label: "Ask Allma Safety AI",
    prompt: "What should I do to stay safe in my area?",
  },
];

export const EMERGENCY_NUMBERS = [
  { label: "Police", number: "999", description: "Crime, violence, immediate danger" },
  { label: "Emergency (toll free)", number: "112", description: "General emergency line" },
  { label: "Ambulance", number: "911", description: "Medical emergencies" },
  { label: "Fire Brigade", number: "112", description: "Fire and rescue" },
];

export const REPORT_TYPE_LABELS: Record<string, string> = {
  crime: "Crime report",
  emergency: "Emergency",
  missing_person: "Missing person",
  lost_item: "Lost property",
  found_item: "Found property",
  other: "Report",
};

export const DISCLAIMER =
  "Allma Safety AI is an independent, Police Integration Ready platform. It is not affiliated with any police force, ambulance, fire or government service. In an emergency always call the official emergency numbers.";
