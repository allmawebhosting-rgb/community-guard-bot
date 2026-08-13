REVOKE EXECUTE ON FUNCTION public.start_voice_call(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_voice_call(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_my_calls(integer) FROM anon;