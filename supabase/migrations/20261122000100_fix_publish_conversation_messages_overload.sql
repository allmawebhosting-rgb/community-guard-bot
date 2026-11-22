BEGIN;

-- Repair: a stray three-argument overload of publish_conversation_messages
-- exists on the live database (it is not defined anywhere in this repo):
--
--   public.publish_conversation_messages(uuid, jsonb)         -- canonical
--   public.publish_conversation_messages(uuid, jsonb, text)   -- stray
--
-- Every caller in this codebase invokes the two-argument form. With the
-- extra overload present, PostgREST cannot choose a candidate function
-- ("Could not choose the best candidate function between: ..."), so EVERY
-- message save fails — plain chat replies, the SOS history flush, and
-- responder messages. Conversations then open blank for responders and
-- after reload, because only the notice pills (emergency_chat_events)
-- still load. Dropping the stray overload restores the two-argument form.
DROP FUNCTION IF EXISTS public.publish_conversation_messages(uuid, jsonb, text);

-- Re-assert the canonical two-argument function (same body as
-- 20261121000700_message_recipient_intent.sql) so the live definition
-- matches the repo even if it drifted.
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
  v_recipient text;
  v_count integer;
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
    v_recipient := nullif(v_row->>'recipient', '');

    IF v_sdk IS NULL THEN
      CONTINUE;
    END IF;
    IF v_role NOT IN ('user', 'assistant', 'system') THEN
      CONTINUE;
    END IF;
    IF v_author IS DISTINCT FROM auth.uid() THEN
      v_author := auth.uid();
    END IF;
    IF v_recipient IS NULL OR v_recipient NOT IN ('allma', 'responders') THEN
      v_recipient := 'allma';
    END IF;
    IF v_role = 'assistant' THEN
      v_recipient := 'allma';
    END IF;

    INSERT INTO public.messages (thread_id, user_id, role, parts, sdk_message_id, recipient)
    VALUES (p_thread_id, v_author, v_role, v_parts, v_sdk, v_recipient)
    ON CONFLICT (sdk_message_id) WHERE sdk_message_id IS NOT NULL DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_conversation_messages(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_conversation_messages(uuid, jsonb) TO authenticated;

COMMIT;
