REVOKE EXECUTE ON FUNCTION public.list_sos_call_targets() FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_sos_emergency_call(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_sos_call_attempts(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_emergency_call_context(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_sos_call_targets() TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_sos_emergency_call(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_sos_call_attempts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_emergency_call_context(uuid) TO authenticated;
