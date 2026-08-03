REVOKE EXECUTE ON FUNCTION public.is_verified_officer(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_command_staff(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;