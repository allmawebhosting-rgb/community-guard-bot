export type NearbyPlace = {
  id: string;
  name: string;
  type: string;
  address: string | null;
  phone: string | null;
  open_now: boolean | null;
  distance_m: number;
  latitude: number;
  longitude: number;
  source: "google" | "seeded";
};

export type NearbyMember = {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  phone_verified: boolean;
  distance_m: number;
  relationship_state: "none" | "connected" | "request_sent" | "request_received";
};
