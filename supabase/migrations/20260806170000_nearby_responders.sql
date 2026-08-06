-- Opt-in community responder presence for SOS alerts.
-- The caller only receives a display name and distance; exact coordinates stay server-side.
CREATE TABLE public.community_responder_locations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  is_available boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX community_responder_locations_available_idx
  ON public.community_responder_locations (is_available, last_seen_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_responder_locations TO authenticated;
GRANT ALL ON public.community_responder_locations TO service_role;
ALTER TABLE public.community_responder_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Responders manage their own presence"
  ON public.community_responder_locations FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.find_nearby_responders(
  origin_lat double precision,
  origin_lng double precision,
  radius_meters double precision DEFAULT 1000
)
RETURNS TABLE (
  id uuid,
  display_name text,
  distance_m double precision,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT
      r.user_id,
      COALESCE(NULLIF(p.full_name, ''), 'Nearby responder') AS responder_name,
      r.latitude,
      r.longitude,
      r.updated_at
    FROM public.community_responder_locations r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    WHERE r.is_available = true
      AND r.user_id <> auth.uid()
      AND r.last_seen_at > now() - interval '10 minutes'
  ),
  distances AS (
    SELECT
      c.user_id,
      c.responder_name,
      c.updated_at,
      6371000.0 * 2.0 * asin(
        sqrt(
          power(sin(radians(c.latitude - origin_lat) / 2.0), 2) +
          cos(radians(origin_lat)) * cos(radians(c.latitude)) *
          power(sin(radians(c.longitude - origin_lng) / 2.0), 2)
        )
      ) AS meters
    FROM candidates c
  )
  SELECT
    d.user_id AS id,
    d.responder_name AS display_name,
    d.meters AS distance_m,
    d.updated_at
  FROM distances d
  WHERE d.meters <= LEAST(GREATEST(radius_meters, 100), 10000)
  ORDER BY d.meters ASC
  LIMIT 10;
$$;

REVOKE ALL ON FUNCTION public.find_nearby_responders(double precision, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_nearby_responders(double precision, double precision, double precision) TO authenticated;