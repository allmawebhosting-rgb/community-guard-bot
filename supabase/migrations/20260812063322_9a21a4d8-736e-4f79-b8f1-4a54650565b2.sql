-- Phone normalization (Uganda-first, keeps other +country numbers intact)
CREATE OR REPLACE FUNCTION public.normalize_phone_ug(_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d text;
BEGIN
  IF _raw IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(_raw, '[^0-9+]', '', 'g');
  IF d = '' THEN RETURN NULL; END IF;

  IF left(d, 1) = '+' THEN
    d := '+' || regexp_replace(substring(d from 2), '[^0-9]', '', 'g');
    RETURN d;
  END IF;

  d := regexp_replace(d, '[^0-9]', '', 'g');

  IF left(d, 5) = '00256' THEN RETURN '+' || substring(d from 3); END IF;
  IF left(d, 3) = '256' AND length(d) = 12 THEN RETURN '+' || d; END IF;
  IF left(d, 1) = '0' AND length(d) = 10 THEN RETURN '+256' || substring(d from 2); END IF;
  IF length(d) = 9 AND left(d, 1) = '7' THEN RETURN '+256' || d; END IF;
  IF left(d, 2) = '00' THEN RETURN '+' || substring(d from 3); END IF;
  RETURN '+' || d;
END;
$$;

-- Profile discovery fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discoverable_by_phone boolean NOT NULL DEFAULT true;

UPDATE public.profiles
SET phone_e164 = public.normalize_phone_ug(phone)
WHERE phone IS NOT NULL AND phone_e164 IS NULL;

CREATE INDEX IF NOT EXISTS profiles_phone_e164_idx ON public.profiles (phone_e164);

CREATE OR REPLACE FUNCTION public.profiles_sync_phone_e164()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.phone_e164 := public.normalize_phone_ug(NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_phone_e164 ON public.profiles;
CREATE TRIGGER profiles_sync_phone_e164
BEFORE INSERT OR UPDATE OF phone ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_sync_phone_e164();

-- Blocks
CREATE TABLE public.safety_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.safety_blocks TO authenticated;
GRANT ALL ON public.safety_blocks TO service_role;
ALTER TABLE public.safety_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own blocks" ON public.safety_blocks
  FOR ALL TO authenticated USING (auth.uid() = blocker_id) WITH CHECK (auth.uid() = blocker_id);

-- Connection requests
CREATE TABLE public.safety_connection_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','cancelled','blocked')),
  note text,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_id <> recipient_id)
);
CREATE UNIQUE INDEX safety_connection_requests_pending_idx
  ON public.safety_connection_requests (requester_id, recipient_id)
  WHERE status = 'pending';
GRANT SELECT, UPDATE ON public.safety_connection_requests TO authenticated;
GRANT ALL ON public.safety_connection_requests TO service_role;
ALTER TABLE public.safety_connection_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can view their requests" ON public.safety_connection_requests
  FOR SELECT TO authenticated USING (auth.uid() = requester_id OR auth.uid() = recipient_id);
CREATE POLICY "Participants can update their requests" ON public.safety_connection_requests
  FOR UPDATE TO authenticated USING (auth.uid() = requester_id OR auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = requester_id OR auth.uid() = recipient_id);
CREATE TRIGGER safety_connection_requests_updated_at
BEFORE UPDATE ON public.safety_connection_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Connections (one row per direction, so each side owns its role + permissions)
CREATE TABLE public.safety_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.safety_connection_requests(id) ON DELETE SET NULL,
  safety_role text NOT NULL DEFAULT 'Friend',
  priority integer NOT NULL DEFAULT 0,
  notify_on_sos boolean NOT NULL DEFAULT true,
  share_location_on_sos boolean NOT NULL DEFAULT true,
  allow_emergency_calls boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, member_id),
  CHECK (owner_id <> member_id)
);
GRANT SELECT, UPDATE, DELETE ON public.safety_connections TO authenticated;
GRANT ALL ON public.safety_connections TO service_role;
ALTER TABLE public.safety_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can view their connections" ON public.safety_connections
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners can update their connections" ON public.safety_connections
  FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can remove their connections" ON public.safety_connections
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE TRIGGER safety_connections_updated_at
BEFORE UPDATE ON public.safety_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Rate limiting log
CREATE TABLE public.phone_lookup_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  searcher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_hash text NOT NULL,
  found boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX phone_lookup_log_searcher_idx ON public.phone_lookup_log (searcher_id, created_at DESC);
GRANT ALL ON public.phone_lookup_log TO service_role;
ALTER TABLE public.phone_lookup_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Searchers can view their own lookup log" ON public.phone_lookup_log
  FOR SELECT TO authenticated USING (auth.uid() = searcher_id);

-- Privacy-safe lookup
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
  VALUES (me, encode(digest(normalized, 'sha256'), 'hex'), target.id IS NOT NULL);

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

-- Send a request
CREATE OR REPLACE FUNCTION public.send_safety_connection_request(_recipient_id uuid, _note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  new_id uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF _recipient_id = me THEN RAISE EXCEPTION 'You cannot connect with yourself'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _recipient_id AND discoverable_by_phone = true) THEN
    RAISE EXCEPTION 'This member is not available';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.safety_blocks
    WHERE (blocker_id = _recipient_id AND blocked_id = me)
       OR (blocker_id = me AND blocked_id = _recipient_id)
  ) THEN
    RAISE EXCEPTION 'This member is not available';
  END IF;

  IF EXISTS (SELECT 1 FROM public.safety_connections WHERE owner_id = me AND member_id = _recipient_id) THEN
    RAISE EXCEPTION 'You are already connected';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.safety_connection_requests
    WHERE status = 'pending'
      AND ((requester_id = me AND recipient_id = _recipient_id)
        OR (requester_id = _recipient_id AND recipient_id = me))
  ) THEN
    RAISE EXCEPTION 'A request is already pending';
  END IF;

  INSERT INTO public.safety_connection_requests (requester_id, recipient_id, note)
  VALUES (me, _recipient_id, NULLIF(btrim(COALESCE(_note, '')), ''))
  RETURNING id INTO new_id;

  INSERT INTO public.notifications (user_id, title, body, kind, link)
  VALUES (
    _recipient_id,
    'New safety connection request',
    COALESCE(NULLIF((SELECT full_name FROM public.profiles WHERE id = me), ''), 'An Allma member')
      || ' wants to join your safety network.',
    'safety_connection_request',
    '/profile'
  );

  RETURN new_id;
END;
$$;

-- Accept / decline / cancel / block
CREATE OR REPLACE FUNCTION public.respond_to_safety_connection_request(_request_id uuid, _action text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  req public.safety_connection_requests;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF _action NOT IN ('accept','decline','cancel','block') THEN
    RAISE EXCEPTION 'Unsupported action';
  END IF;

  SELECT * INTO req FROM public.safety_connection_requests WHERE id = _request_id FOR UPDATE;
  IF req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF req.status <> 'pending' THEN RAISE EXCEPTION 'This request is no longer pending'; END IF;

  IF _action = 'cancel' THEN
    IF req.requester_id <> me THEN RAISE EXCEPTION 'Not authorized'; END IF;
    UPDATE public.safety_connection_requests
      SET status = 'cancelled', responded_at = now() WHERE id = req.id;
    RETURN 'cancelled';
  END IF;

  IF req.recipient_id <> me THEN RAISE EXCEPTION 'Not authorized'; END IF;

  IF _action = 'decline' THEN
    UPDATE public.safety_connection_requests
      SET status = 'declined', responded_at = now() WHERE id = req.id;
    RETURN 'declined';
  END IF;

  IF _action = 'block' THEN
    UPDATE public.safety_connection_requests
      SET status = 'blocked', responded_at = now() WHERE id = req.id;
    INSERT INTO public.safety_blocks (blocker_id, blocked_id)
      VALUES (me, req.requester_id) ON CONFLICT DO NOTHING;
    RETURN 'blocked';
  END IF;

  UPDATE public.safety_connection_requests
    SET status = 'accepted', responded_at = now() WHERE id = req.id;

  INSERT INTO public.safety_connections (owner_id, member_id, request_id)
    VALUES (req.requester_id, req.recipient_id, req.id)
    ON CONFLICT (owner_id, member_id) DO NOTHING;
  INSERT INTO public.safety_connections (owner_id, member_id, request_id)
    VALUES (req.recipient_id, req.requester_id, req.id)
    ON CONFLICT (owner_id, member_id) DO NOTHING;

  INSERT INTO public.notifications (user_id, title, body, kind, link)
  VALUES (
    req.requester_id,
    'Safety connection accepted',
    COALESCE(NULLIF((SELECT full_name FROM public.profiles WHERE id = me), ''), 'An Allma member')
      || ' accepted your safety connection request.',
    'safety_connection_accepted',
    '/profile'
  );

  RETURN 'accepted';
END;
$$;

-- Read incoming/outgoing requests with a limited profile of the other person
CREATE OR REPLACE FUNCTION public.list_safety_connection_requests()
RETURNS TABLE(
  id uuid, direction text, other_user_id uuid, full_name text, avatar_url text,
  phone_verified boolean, note text, created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    CASE WHEN r.requester_id = auth.uid() THEN 'outgoing' ELSE 'incoming' END,
    CASE WHEN r.requester_id = auth.uid() THEN r.recipient_id ELSE r.requester_id END,
    COALESCE(NULLIF(p.full_name, ''), 'Allma member'),
    p.avatar_url,
    p.phone_verified,
    r.note,
    r.created_at
  FROM public.safety_connection_requests r
  JOIN public.profiles p
    ON p.id = CASE WHEN r.requester_id = auth.uid() THEN r.recipient_id ELSE r.requester_id END
  WHERE r.status = 'pending'
    AND (r.requester_id = auth.uid() OR r.recipient_id = auth.uid())
  ORDER BY r.created_at DESC;
$$;

-- Read my connections with limited profiles
CREATE OR REPLACE FUNCTION public.list_safety_connections()
RETURNS TABLE(
  id uuid, member_id uuid, full_name text, avatar_url text, phone_verified boolean,
  safety_role text, priority integer, notify_on_sos boolean,
  share_location_on_sos boolean, allow_emergency_calls boolean, created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id, c.member_id,
    COALESCE(NULLIF(p.full_name, ''), 'Allma member'),
    p.avatar_url, p.phone_verified,
    c.safety_role, c.priority, c.notify_on_sos,
    c.share_location_on_sos, c.allow_emergency_calls, c.created_at
  FROM public.safety_connections c
  JOIN public.profiles p ON p.id = c.member_id
  WHERE c.owner_id = auth.uid()
  ORDER BY c.priority ASC, c.created_at ASC;
$$;