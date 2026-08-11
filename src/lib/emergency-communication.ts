export type EmergencyCategory =
  "medical" | "crime" | "fire" | "accident" | "missing_person" | "other";
export type EmergencySeverity = "critical" | "high" | "medium" | "low";
export type EmergencyCommandState =
  | "SOS_ACTIVE"
  | "LOCATION_ACQUIRING"
  | "ASSESSING"
  | "CLASSIFIED"
  | "RESPONDER_SEARCHING"
  | "CONTACTING"
  | "RESPONDER_ACCEPTED"
  | "RESPONDER_EN_ROUTE"
  | "RESPONDER_ARRIVED"
  | "OFFICIAL_ASSISTANCE_PENDING"
  | "OFFICIAL_ASSISTANCE_CONFIRMED"
  | "RESOLVED"
  | "CANCELLED";
export type CallState =
  | "connecting"
  | "ringing"
  | "connected"
  | "reconnecting"
  | "poor_connection"
  | "disconnected"
  | "declined"
  | "no_answer"
  | "busy"
  | "permission_denied"
  | "microphone_error"
  | "network_error"
  | "server_error";

export type ResponderCandidate = {
  id: string;
  name: string;
  distanceMeters: number;
  skills: EmergencyCategory[];
  verified: boolean;
  available: boolean;
  optedIn: boolean;
  emergencyPermissions: boolean;
  blocked: boolean;
  handlingAnotherEmergency: boolean;
  locationFresh: boolean;
  responseScore?: number;
};

export type ContactRecommendation = {
  candidateId: string;
  priorityScore: number;
  reason: string;
};

const OFFICIAL_FIRST: Record<EmergencyCategory, boolean> = {
  medical: false,
  crime: true,
  fire: true,
  accident: false,
  missing_person: false,
  other: false,
};

const CRITICAL_CATEGORIES = new Set<EmergencyCategory>(["crime", "fire"]);

/**
 * Pure decision boundary for the server-side escalation worker.
 * The client may display its result, but must not use this to discover users
 * or bypass responder consent. Production callers should run it behind RLS.
 */
export function rankEmergencyContacts(input: {
  category: EmergencyCategory;
  severity: EmergencySeverity;
  immediateDanger: boolean;
  candidates: ResponderCandidate[];
  citizenCircleIds?: string[];
}): ContactRecommendation[] {
  const circle = new Set(input.citizenCircleIds ?? []);
  const isCritical = input.severity === "critical" || input.immediateDanger;

  return input.candidates
    .filter(
      (candidate) =>
        candidate.optedIn &&
        candidate.emergencyPermissions &&
        candidate.available &&
        !candidate.blocked &&
        !candidate.handlingAnotherEmergency &&
        candidate.locationFresh,
    )
    .map((candidate) => {
      let score = 0;
      if (circle.has(candidate.id)) score += 35;
      if (candidate.skills.includes(input.category)) score += 30;
      if (candidate.verified) score += 20;
      score += Math.max(0, 20 - Math.min(candidate.distanceMeters / 100, 20));
      if (isCritical && candidate.verified) score += 10;
      if (OFFICIAL_FIRST[input.category]) score -= 5;
      return {
        candidateId: candidate.id,
        priorityScore: Math.round(score),
        reason: [
          circle.has(candidate.id) ? "trusted circle" : "opt-in community responder",
          candidate.skills.includes(input.category) ? "matching skill" : "eligible responder",
          candidate.verified ? "verified" : "approved",
          `${Math.round(candidate.distanceMeters)}m away`,
        ].join(" · "),
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

export function shouldEscalateOfficially(
  category: EmergencyCategory,
  severity: EmergencySeverity,
  immediateDanger: boolean,
) {
  return immediateDanger || severity === "critical" || CRITICAL_CATEGORIES.has(category);
}

export function formatDistance(distanceMeters: number) {
  return distanceMeters < 1000
    ? `${Math.round(distanceMeters)}m`
    : `${(distanceMeters / 1000).toFixed(1)}km`;
}
