import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { lookupNearbyPlaces, type NearbyPlaceResult } from "@/lib/places.server";

const nearbyPlacesInput = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(200).max(10000).default(2500),
  limit: z.number().int().min(1).max(20).default(10),
  types: z.array(z.string()).max(5).default(["hospital", "police", "fire_station", "clinic"]),
});

export const getNearbyPlaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => nearbyPlacesInput.parse(input))
  .handler(async ({ data }) => {
    const places = await lookupNearbyPlaces({
      latitude: data.latitude,
      longitude: data.longitude,
      radiusMeters: data.radiusMeters,
      limit: data.limit,
      types: data.types,
    });

    return places as NearbyPlaceResult[];
  });

const nearbyMembersInput = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(200).max(5000).default(2000),
  limit: z.number().int().min(1).max(20).default(10),
});

export const getNearbyMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => nearbyMembersInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: result, error } = await supabase.rpc("find_nearby_members", {
      radius_m: data.radiusMeters,
      lat: data.latitude,
      lng: data.longitude,
      limit_n: data.limit,
    });

    if (error) throw new Error(error.message);
    return (result ?? []) as Array<{
      user_id: string;
      full_name: string;
      avatar_url: string | null;
      phone_verified: boolean;
      distance_m: number;
      relationship_state: "none" | "connected" | "request_sent" | "request_received";
    }>;
  });

const nearbyPresenceInput = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  sharingEnabled: z.boolean().default(true),
});

export const upsertNearbyPresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => nearbyPresenceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("upsert_member_presence", {
      lat: data.latitude,
      lng: data.longitude,
      sharing_enabled: data.sharingEnabled,
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const disableNearbyPresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.from("member_presence").delete().eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
