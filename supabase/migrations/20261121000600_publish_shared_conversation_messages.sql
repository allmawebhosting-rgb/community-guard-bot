BEGIN;

-- Reliable publish/read for the canonical Allma conversation.
-- Client upserts on the partial sdk_message_id index were failing silently,
-- so SOS threads were empty when responders joined.

CREATE OR REPLACE FUNCTION public.publish_conversation_messages(
  p_thread_id uuid,
  p_messages jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_inserted integer := 0;
  v_sdk text;
  v_role text;
  v_parts jsonb;
  v_author uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  IF p_thread_id IS NULL THEN
    RAISE EXCEPTION 'Conversation id is required';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.threads t WHERE t.id = p_thread_id AND t.user_id = auth.uid())
    OR public.can_write_sos_thread(p_thread_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'You cannot write to this conversation';
  END IF;

  IF p_messages IS NULL OR jsonb_typeof(p_messages) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_messages)
  LOOP
    v_sdk := nullif(v_row->>'sdk_message_id', '');
    v_role := coalesce(nullif(v_row->>'role', ''), 'user');
    v_parts := coalesce(v_row->'parts', '[]'::jsonb);
    v_author := coalesce(nullif(v_row->>'user_id', '')::uuid, auth.uid());

    IF v_sdk IS NULL THEN
      CONTINUE;
    END IF;
    IF v_role NOT IN ('user', 'assistant', 'system') THEN
      CONTINUE;
    END IF;
    -- Authors may only publish as themselves (AI replies are stored under the sender).
    IF v_author IS DISTINCT FROM auth.uid() THEN
      v_author := auth.uid();
    END IF;

    INSERT INTO public.messages (thread_id, user_id, role, parts, sdk_message_id)
    VALUES (p_thread_id, v_author, v_role, v_parts, v_sdk)
    ON CONFLICT (sdk_message_id) WHERE sdk_message_id IS NOT NULL DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_conversation_messages(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_conversation_messages(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_shared_conversation_messages(p_thread_id uuid)
RETURNS TABLE (
  id uuid,
  thread_id uuid,
  user_id uuid,
  role text,
  parts jsonb,
  sdk_message_id text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.threads t WHERE t.id = p_thread_id AND t.user_id = auth.uid())
    OR public.can_access_sos_thread(p_thread_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'You cannot read this conversation';
  END IF;

  RETURN QUERY
  SELECT m.id, m.thread_id, m.user_id, m.role, m.parts, m.sdk_message_id, m.created_at
  FROM public.messages m
  WHERE m.thread_id = p_thread_id
  ORDER BY m.created_at ASC, m.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_shared_conversation_messages(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_shared_conversation_messages(uuid) TO authenticated;

COMMIT;
