export type QuickAction = {
  id: string;
  emoji: string;
  label: string;
  description: string;
  prompt: string;
  tone?: "urgent" | "default";
  /** Tailwind bg/text classes for the icon circle */
  iconColor: string;
};

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "sos",
    emoji: "🚨",
    label: "Emergency SOS",
    description: "Immediate help & location sharing",
    prompt: "This is an emergency. I need help right now.",
    tone: "urgent",
    iconColor: "bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400",
  },
  {
    id: "crime",
    emoji: "🚔",
    label: "Report Crime",
    description: "File a report step by step",
    prompt: "I want to report a crime.",
    iconColor: "bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400",
  },
  {
    id: "missing",
    emoji: "👤",
    label: "Missing Person",
    description: "Report and share a profile",
    prompt: "I need to report a missing person.",
    iconColor: "bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400",
  },
  {
    id: "lost",
    emoji: "🎒",
    label: "Lost & Found",
    description: "Log lost or recovered items",
    prompt: "I want to report something lost or found.",
    iconColor: "bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400",
  },
  {
    id: "hospital",
    emoji: "🏥",
    label: "Find Hospital",
    description: "Nearest facility with directions",
    prompt: "Find the nearest hospital.",
    iconColor: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "police",
    emoji: "👮",
    label: "Find Police Station",
    description: "Locate stations near you",
    prompt: "Find the nearest police station.",
    iconColor: "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400",
  },
  {
    id: "fire",
    emoji: "🚒",
    label: "Fire Emergency",
    description: "Alert fire brigade instantly",
    prompt: "There is a fire. I need help.",
    tone: "urgent",
    iconColor: "bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400",
  },
  {
    id: "ambulance",
    emoji: "🚑",
    label: "Ambulance",
    description: "Request emergency medical care",
    prompt: "I need an ambulance.",
    tone: "urgent",
    iconColor: "bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400",
  },
  {
    id: "alerts",
    emoji: "📢",
    label: "Community Alerts",
    description: "Safety updates in your area",
    prompt: "Show me the latest community safety alerts near me.",
    iconColor: "bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400",
  },
  {
    id: "ask",
    emoji: "💬",
    label: "Ask Allma AI",
    description: "Chat with your safety assistant",
    prompt: "What should I do to stay safe in my area?",
    iconColor: "bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400",
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
