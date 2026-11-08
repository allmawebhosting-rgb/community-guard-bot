-- Use opted-in member presence for nearby responder offers.
-- community_responder_locations was removed; presence now lives in
-- member_presence + profiles.discoverable_nearby.
CREATE OR REPLACE FUNCTION public.create_sos_responder_offers(
  p_sos_activity_id uuid,
  p_radius_meters double precision DEFAULT 1000
)
RETURNS TABLE (offer_id uuid, responder_id uuid, display_name text, distance_m double precision, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE requester uuid;
BEGIN
  SELECT user_id INTO requester FROM public.safety_activity
  WHERE id = p_sos_activity_id AND activity_type = 'sos_activated';
  IF requester IS NULL OR requester <> auth.uid() THEN
    RAISE EXCEPTION 'You can only create offers for your own SOS';
  END IF;

  WITH origin AS (
    SELECT latitude AS lat, longitude AS lng FROM public.safety_activity
    WHERE id = p_sos_activity_id AND latitude IS NOT NULL AND longitude IS NOT NULL
  ),
  candidates AS (
    SELECT m.user_id,
      6371000.0 * 2.0 * asin(sqrt(
        power(sin(radians(m.lat - o.lat) / 2.0), 2) +
        cos(radians(o.lat)) * cos(radians(m.lat)) * power(sin(radians(m.lng - o.lng) / 2.0), 2)
      )) AS meters
    FROM public.member_presence m
    JOIN public.profiles p ON p.id = m.user_id AND p.discoverable_nearby IS TRUE
    CROSS JOIN origin o
    WHERE m.sharing_enabled AND m.user_id <> auth.uid()
      AND m.updated_at > now() - interval '10 minutes'
  ),
  inserted AS (
    INSERT INTO public.sos_responder_offers (sos_activity_id, requester_id, responder_id, distance_m)
    SELECT p_sos_activity_id, auth.uid(), c.user_id, c.meters FROM candidates c
    WHERE c.meters <= LEAST(GREATEST(p_radius_meters, 100), 10000)
    ON CONFLICT (sos_activity_id, responder_id) DO NOTHING
    RETURNING sos_responder_offers.responder_id AS rid
  )
  INSERT INTO public.notifications (user_id, title, body, kind, link)
  SELECT i.rid, 'Nearby SOS alert',
    'Someone nearby needs help. Open Allma to accept or decline this alert.',
    'sos_responder_offer', '/profile'
  FROM inserted i;

  RETURN QUERY
  SELECT o.id, o.responder_id, COALESCE(NULLIF(p.full_name, ''), 'Nearby responder'), o.distance_m, o.status
  FROM public.sos_responder_offers o
  LEFT JOIN public.profiles p ON p.id = o.responder_id
  WHERE o.sos_activity_id = p_sos_activity_id AND o.requester_id = auth.uid()
  ORDER BY o.distance_m ASC;
END;
$$;
REVOKE ALL ON FUNCTION public.create_sos_responder_offers(uuid, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sos_responder_offers(uuid, double precision) TO authenticated;
