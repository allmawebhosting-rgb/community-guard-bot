CREATE OR REPLACE FUNCTION public.find_allma_member_by_phone(_phone text)
RETURNS TABLE(user_id uuid, full_name text, avatar_url text, phone_verified boolean, relationship_state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  normalized text;
  hourly integer;
  daily integer;
  target public.profiles;
  state text := 'none';
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in to search Allma'; END IF;

  normalized := public.normalize_phone_ug(_phone);
  IF normalized IS NULL OR length(normalized) < 8 THEN
    RAISE EXCEPTION 'Enter a valid phone number';
  END IF;

  SELECT count(*) INTO hourly FROM public.phone_lookup_log
    WHERE searcher_id = me AND created_at > now() - interval '1 hour';
  SELECT count(*) INTO daily FROM public.phone_lookup_log
    WHERE searcher_id = me AND created_at > now() - interval '24 hours';
  IF hourly >= 15 OR daily >= 60 THEN
    RAISE EXCEPTION 'Too many searches. Please try again later.';
  END IF;

  SELECT * INTO target FROM public.profiles
  WHERE phone_e164 = normalized
    AND discoverable_by_phone = true
    AND id <> me
  LIMIT 1;

  IF target.id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.safety_blocks
    WHERE (blocker_id = target.id AND blocked_id = me)
       OR (blocker_id = me AND blocked_id = target.id)
  ) THEN
    target := NULL;
  END IF;

  INSERT INTO public.phone_lookup_log (searcher_id, phone_hash, found)
  VALUES (me, encode(sha256(convert_to(normalized, 'UTF8')), 'hex'), target.id IS NOT NULL);

  IF target.id IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.safety_connections c WHERE c.owner_id = me AND c.member_id = target.id) THEN
    state := 'connected';
  ELSIF EXISTS (
    SELECT 1 FROM public.safety_connection_requests r
    WHERE r.status = 'pending' AND r.requester_id = me AND r.recipient_id = target.id
  ) THEN
    state := 'request_sent';
  ELSIF EXISTS (
    SELECT 1 FROM public.safety_connection_requests r
    WHERE r.status = 'pending' AND r.requester_id = target.id AND r.recipient_id = me
  ) THEN
    state := 'request_received';
  END IF;

  RETURN QUERY SELECT
    target.id,
    COALESCE(NULLIF(target.full_name, ''), 'Allma member'),
    target.avatar_url,
    target.phone_verified,
    state;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.find_allma_member_by_phone(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.send_safety_connection_request(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.respond_to_safety_connection_request(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_safety_connection_requests() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_safety_connections() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.find_allma_member_by_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_safety_connection_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_safety_connection_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_safety_connection_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_safety_connections() TO authenticated;