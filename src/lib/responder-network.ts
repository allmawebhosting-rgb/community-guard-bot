export const RESPONDER_TYPES = [
  { value: "community_volunteer", label: "Community Volunteer", professional: false },
  { value: "first_aid_responder", label: "First Aid Responder", professional: false },
  { value: "medical_professional", label: "Medical Professional", professional: true },
  { value: "fire_safety_volunteer", label: "Fire Safety Volunteer", professional: false },
  { value: "search_rescue_volunteer", label: "Search & Rescue Volunteer", professional: false },
  { value: "transport_assistance", label: "Transport Assistance", professional: false },
  { value: "child_safety_volunteer", label: "Child Safety Volunteer", professional: false },
  { value: "community_leader", label: "Community Leader", professional: true },
  { value: "other", label: "Other", professional: false },
] as const;

export const RESPONDER_SKILLS = [
  "First aid",
  "Welfare check",
  "Fire safety",
  "Search and rescue",
  "Child safety",
  "Transport assistance",
  "Community safety",
] as const;

export const SERVICE_RADII = [
  { value: 500, label: "500 m" },
  { value: 1000, label: "1 km" },
  { value: 2000, label: "2 km" },
  { value: 5000, label: "5 km" },
  { value: 10000, label: "10 km" },
] as const;

export type ResponderAvailability =
  | "available"
  | "busy"
  | "handling_emergency"
  | "unavailable"
  | "offline";

export type ResponderStatus = "assigned" | "accepted" | "en_route" | "arrived" | "assisting" | "need_official_help" | "completed" | "unable_to_continue" | "cancelled";

export const AVAILABILITY_OPTIONS: {
  value: ResponderAvailability;
  label: string;
  description: string;
  dot: string;
}[] = [
  { value: "available", label: "Available", description: "You may receive emergency requests.", dot: "bg-emerald-500" },
  { value: "busy", label: "Busy", description: "Only critical requests may reach you.", dot: "bg-amber-500" },
  { value: "handling_emergency", label: "Handling emergency", description: "Pause new assignments while assisting.", dot: "bg-red-500" },
  { value: "offline", label: "Offline", description: "You will not receive emergency requests.", dot: "bg-slate-500" },
];

export const VERIFICATION_COPY: Record<string, string> = {
  unverified: "No verification completed",
  basic_verified: "Identity verified",
  skill_verified: "Specific skill verified",
  organization_verified: "Approved organization verified",
  authorized_responder: "Authority approval recorded",
};

export function formatApproximateDistance(meters: number | null | undefined) {
  if (meters == null || !Number.isFinite(meters)) return "Distance unavailable";
  return meters < 1000 ? `Approximately ${Math.round(meters)}m away` : `Approximately ${(meters / 1000).toFixed(1)}km away`;
}

export function locationFreshness(recordedAt: string | null | undefined) {
  if (!recordedAt) return { label: "Unavailable", tone: "text-muted-foreground", fresh: false };
  const ageSeconds = Math.max(0, (Date.now() - new Date(recordedAt).getTime()) / 1000);
  if (ageSeconds <= 60) return { label: "Excellent", tone: "text-emerald-500", fresh: true };
  if (ageSeconds <= 300) return { label: "Good", tone: "text-amber-500", fresh: true };
  return { label: "Stale", tone: "text-destructive", fresh: false };
}

export function isDangerousIncident(category: string | null | undefined, immediateDanger = false) {
  return immediateDanger || ["crime", "fire"].includes(category ?? "");
}