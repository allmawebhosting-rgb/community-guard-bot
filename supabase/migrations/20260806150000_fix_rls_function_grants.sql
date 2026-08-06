-- The previous migration revoked EXECUTE on all helper functions, including the
-- SECURITY DEFINER functions used inside RLS policies. When authenticated users
-- query any table that has those policies, Postgres raises
-- "permission denied for function is_verified_officer/is_command_staff/has_role".
--
-- Fix: grant EXECUTE back to authenticated (and anon where the RLS policy is
-- also reachable by anonymous users, e.g. police_stations SELECT).

GRANT EXECUTE ON FUNCTION public.is_verified_officer(uuid)        TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_command_staff(uuid)           TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)  TO authenticated, anon;
