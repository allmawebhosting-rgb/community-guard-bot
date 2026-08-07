-- Private SOS offers for opted-in community responders.
-- Exact coordinates are never exposed through this workflow.
CREATE TABLE public.sos_responder_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_activity_id uuid NOT NULL REFERENCES public.safety_activity(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  responder_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  distance_m double precision NOT NULL CHECK (distance_m >= 0),
  status text NOT NULL DEFAULT 'offered'
    CHECK (status IN ('offered', 'accepted', 'declined', 'en_route', 'arrived', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sos_activity_id, responder_id)
);

CREATE INDEX sos_responder_offers_requester_idx
  ON public.sos_responder_offers (requester_id, created_at DESC);
CREATE INDEX sos_responder_offers_responder_idx
  ON public.sos_responder_offers (responder_id, created_at DESC);
CREATE INDEX sos_responder_offers_sos_idx
  ON public.sos_responder_offers (sos_activity_id, created_at);

GRANT SELECT ON public.sos_responder_offers TO authenticated;
GRANT ALL ON public.sos_responder_offers TO service_role;
ALTER TABLE public.sos_responder_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SOS participants can view their offers"
  ON public.sos_responder_offers FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = responder_id);

ALTER TABLE public.sos_responder_offers
  ADD CONSTRAINT sos_responder_offers_requester_not_responder
  CHECK (requester_id <> responder_id);

CREATE OR REPLACE FUNCTION public.create_sos_responder_offers(
  p_sos_activity_id uuid,
  p_radius_meters double precision DEFAULT 1000
)
RETURNS TABLE (
  offer_id uuid,
  responder_id uuid,
  display_name text,
  distance_m double precision,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester uuid;
BEGIN
  SELECT user_id INTO requester
  FROM public.safety_activity
  WHERE id = p_sos_activity_id
    AND activity_type = 'sos_activated';

  IF requester IS NULL OR requester <> auth.uid() THEN
    RAISE EXCEPTION 'You can only create offers for your own SOS';
  END IF;

  WITH origin AS (
    SELECT latitude AS lat, longitude AS lng
    FROM public.safety_activity
    WHERE id = p_sos_activity_id
  ),
  candidates AS (
    SELECT
      r.user_id,
      r.latitude,
      r.longitude,
      6371000.0 * 2.0 * asin(
        sqrt(
          power(sin(radians(r.latitude - o.lat) / 2.0), 2) +
          cos(radians(o.lat)) * cos(radians(r.latitude)) *
          power(sin(radians(r.longitude - o.lng) / 2.0), 2)
        )
      ) AS meters
    FROM public.community_responder_locations r
    CROSS JOIN origin o
    WHERE r.is_available = true
      AND r.user_id <> auth.uid()
      AND r.last_seen_at > now() - interval '10 minutes'
  ),
  inserted AS (
    INSERT INTO public.sos_responder_offers (
      sos_activity_id, requester_id, responder_id, distance_m
    )
    SELECT
      p_sos_activity_id, auth.uid(), c.user_id, c.meters
    FROM candidates c
    WHERE c.meters <= LEAST(GREATEST(p_radius_meters, 100), 10000)
    ON CONFLICT (sos_activity_id, responder_id) DO NOTHING
    RETURNING id, responder_id, distance_m, status
  )
  INSERT INTO public.notifications (user_id, title, body, kind, link)
  SELECT
    i.responder_id,
    'Nearby SOS alert',
    'Someone nearby needs help. Open Allma to accept or decline this alert.',
    'sos_responder_offer',
    '/profile'
  FROM inserted i;

  RETURN QUERY
  SELECT
    o.id,
    o.responder_id,
    COALESCE(NULLIF(p.full_name, ''), 'Nearby responder'),
    o.distance_m,
    o.status
  FROM public.sos_responder_offers o
  LEFT JOIN public.profiles p ON p.id = o.responder_id
  WHERE o.sos_activity_id = p_sos_activity_id
    AND o.requester_id = auth.uid()
  ORDER BY o.distance_m ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_sos_offer(
  p_offer_id uuid,
  p_status text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status text;
  requester uuid;
BEGIN
  IF p_status NOT IN ('accepted', 'declined', 'en_route', 'arrived') THEN
    RAISE EXCEPTION 'Unsupported responder status';
  END IF;

  SELECT status, requester_id
  INTO current_status, requester
  FROM public.sos_responder_offers
  WHERE id = p_offer_id
    AND responder_id = auth.uid();

  IF current_status IS NULL THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  IF (current_status = 'offered' AND p_status NOT IN ('accepted', 'declined'))
     OR (current_status = 'accepted' AND p_status <> 'en_route')
     OR (current_status = 'en_route' AND p_status <> 'arrived') THEN
    RAISE EXCEPTION 'Invalid status transition';
  END IF;

  UPDATE public.sos_responder_offers
  SET status = p_status,
      responded_at = COALESCE(responded_at, now()),
      updated_at = now()
  WHERE id = p_offer_id;

  INSERT INTO public.notifications (user_id, title, body, kind, link)
  VALUES (
    requester,
    CASE p_status
      WHEN 'accepted' THEN 'A nearby responder accepted'
      WHEN 'declined' THEN 'A nearby responder declined'
      WHEN 'en_route' THEN 'A responder is on the way'
      ELSE 'A responder marked the SOS arrived'
    END,
    CASE p_status
      WHEN 'accepted' THEN 'A nearby responder accepted your SOS alert.'
      WHEN 'declined' THEN 'A nearby responder declined your SOS alert.'
      WHEN 'en_route' THEN 'Your responder marked themselves as en route.'
      ELSE 'Your responder marked themselves as arrived.'
    END,
    'sos_responder_update',
    '/sos'
  );

  RETURN p_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_sos_offers()
RETURNS TABLE (
  offer_id uuid,
  sos_activity_id uuid,
  emergency_type text,
  area text,
  distance_m double precision,
  status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    o.sos_activity_id,
    COALESCE(sa.details ->> 'emergency_type', 'other'),
    COALESCE(
      NULLIF(regexp_replace(sa.location_text, '^.*,\\s*', ''), ''),
      'nearby area'
    ),
    o.distance_m,
    o.status,
    o.created_at
  FROM public.sos_responder_offers o
  JOIN public.safety_activity sa ON sa.id = o.sos_activity_id
  WHERE o.responder_id = auth.uid()
    AND o.created_at > now() - interval '24 hours'
  ORDER BY o.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.create_sos_responder_offers(uuid, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_to_sos_offer(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_sos_offers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sos_responder_offers(uuid, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_sos_offer(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_sos_offers() TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_responder_offers;