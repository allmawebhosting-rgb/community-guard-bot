BEGIN;

-- Repair (follow-up to 20261122000100): the live database also carried a
-- stray overload of finish_sos_call_round that this repo never defined:
--
--   public.finish_sos_call_round(uuid, uuid[])   -- canonical (20261121000400)
--   public.finish_sos_call_round(uuid, integer)  -- stray (p_round_number)
--
-- The app only ever calls the (uuid, uuid[]) form with named arguments, so
-- this stray was not breaking calls today, but it is the same kind of
-- live-database drift that broke message saving on 2026-11-22: an extra
-- overload can make PostgREST function resolution ambiguous for future
-- callers. Drop it so the live database matches the repo.
DROP FUNCTION IF EXISTS public.finish_sos_call_round(uuid, integer);

COMMIT;
