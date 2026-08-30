ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS discoverable_nearby boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.member_presence (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  geohash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  sharing_enabled boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS member_presence_sharing_updated_idx
  ON public.member_presence (sharing_enabled, updated_at DESC);

ALTER TABLE public.member_presence ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_presence TO authenticated;

DROP POLICY IF EXISTS "member_presence_manage_own_row" ON public.member_presence;
CREATE POLICY "member_presence_manage_own_row"
  ON public.member_presence
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.geohash_encode(p_lat double precision, p_lng double precision)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  base32 text := '0123456789bcdefghjkmnpqrstuvwxyz';
  lat_min double precision := -90;
  lat_max double precision := 90;
  lng_min double precision := -180;
  lng_max double precision := 180;
  lat_mid double precision;
  lng_mid double precision;
  idx integer;
  bit_index integer := 0;
  even_bit boolean := true;
  geohash text := '';
  char_index integer;
  mask integer;
  value integer;
BEGIN
  FOR i IN 1..8 LOOP
    IF even_bit THEN
      value := 0;
      FOR j IN 1..5 LOOP
        lng_mid := (lng_min + lng_max) / 2;
        IF p_lng > lng_mid THEN
          value := (value << 1) + 1;
          lng_min := lng_mid;
        ELSE
          value := (value << 1);
          lng_max := lng_mid;
        END IF;
      END LOOP;
      char_index := value;
      geohash := geohash || substr(base32, char_index + 1, 1);
      even_bit := false;
    ELSE
      value := 0;
      FOR j IN 1..5 LOOP
        lat_mid := (lat_min + lat_max) / 2;
        IF p_lat > lat_mid THEN
          value := (value << 1) + 1;
          lat_min := lat_mid;
        ELSE
          value := (value << 1);
          lat_max := lat_mid;
        END IF;
      END LOOP;
      char_index := value;
      geohash := geohash || substr(base32, char_index + 1, 1);
      even_bit := true;
    END IF;
  END LOOP;

  RETURN geohash;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_member_presence(
  lat double precision,
  lng double precision,
  sharing_enabled boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to share your presence.';
  END IF;

  INSERT INTO public.member_presence (user_id, lat, lng, geohash, updated_at, sharing_enabled)
  VALUES (auth.uid(), lat, lng, public.geohash_encode(lat, lng), now(), sharing_enabled)
  ON CONFLICT (user_id)
  DO UPDATE SET
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    geohash = EXCLUDED.geohash,
    updated_at = now(),
    sharing_enabled = EXCLUDED.sharing_enabled;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_member_presence(double precision, double precision, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.find_nearby_members(
  radius_m integer,
  lat double precision,
  lng double precision,
  limit_n integer DEFAULT 10
)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  avatar_url text,
  phone_verified boolean,
  distance_m double precision,
  relationship_state text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH nearby AS (
    SELECT
      mp.user_id,
      pr.full_name,
      pr.avatar_url,
      pr.phone_verified,
      (
        6371000 * acos(
          least(1,
            cos(radians(lat)) * cos(radians(mp.lat)) *
            cos(radians(mp.lng) - radians(lng)) +
            sin(radians(lat)) * sin(radians(mp.lat))
          )
        )
      ) AS distance_m,
      CASE
        WHEN sc.member_id IS NOT NULL THEN 'connected'
        WHEN scr.requester_id = auth.uid() AND scr.recipient_id = mp.user_id AND scr.status = 'pending' THEN 'request_sent'
        WHEN scr.requester_id = mp.user_id AND scr.recipient_id = auth.uid() AND scr.status = 'pending' THEN 'request_received'
        ELSE 'none'
      END AS relationship_state
    FROM public.member_presence mp
    JOIN public.profiles pr ON pr.id = mp.user_id
    LEFT JOIN public.safety_connections sc
      ON sc.owner_id = auth.uid() AND sc.member_id = mp.user_id
    LEFT JOIN public.safety_connection_requests scr
      ON scr.requester_id IN (auth.uid(), mp.user_id)
     AND scr.recipient_id IN (auth.uid(), mp.user_id)
     AND scr.status = 'pending'
     AND scr.requester_id <> scr.recipient_id
    WHERE mp.user_id <> auth.uid()
      AND mp.sharing_enabled = true
      AND mp.updated_at > now() - interval '15 minutes'
      AND pr.discoverable_nearby = true
      AND (
        6371000 * acos(
          least(1,
            cos(radians(lat)) * cos(radians(mp.lat)) *
            cos(radians(mp.lng) - radians(lng)) +
            sin(radians(lat)) * sin(radians(mp.lat))
          )
        )
      ) <= radius_m
    ORDER BY distance_m ASC
    LIMIT limit_n
  )
  SELECT
    user_id,
    full_name,
    avatar_url,
    phone_verified,
    distance_m,
    relationship_state
  FROM nearby;
$$;

GRANT EXECUTE ON FUNCTION public.find_nearby_members(integer, double precision, double precision, integer) TO authenticated;
