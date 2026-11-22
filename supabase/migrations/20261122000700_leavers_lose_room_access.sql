-- Leaving an SOS room must close the door behind the responder.
-- Migration 20261122000300 made leavers disappear from the member list and
-- the rooms inbox, but can_access_sos_room still granted them full access,
-- so the app let a responder who had left walk straight back in
-- (reported live by Allma, 2026-11-22: "After leaving it again enters me").
--
-- can_access_sos_thread / can_write_sos_room / can_write_sos_thread all
-- delegate to can_access_sos_room, so one guard here closes every path.
-- The owner is exempt (the owner ends the SOS instead of leaving, and
-- leave_sos_room refuses owners anyway). Body is the live definition
-- (probed 2026-11-22) with only the leaver guard added.

CREATE OR REPLACE FUNCTION public.can_access_sos_room(_sos_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(_user_id = auth.uid(), false) AND EXISTS (
    SELECT 1 FROM public.safety_activity a
    WHERE a.id = _sos_id AND (
      a.user_id = _user_id
      OR (
        NOT EXISTS (
          SELECT 1 FROM public.emergency_chat_events e
          WHERE e.sos_session_id = a.id
            AND e.author_id = _user_id
            AND e.event_type = 'participant_left'
        )
        AND (
          EXISTS (
            SELECT 1 FROM public.emergency_call_invitations i
            WHERE i.emergency_id = a.id
              AND i.recipient_user_id = _user_id
              AND upper(i.status) = 'ACCEPTED'
          )
          OR EXISTS (
            SELECT 1 FROM public.sos_responder_offers o
            WHERE o.sos_activity_id = a.id
              AND o.responder_id = _user_id
              AND lower(o.status) = 'accepted'
          )
          OR EXISTS (
            SELECT 1 FROM public.responder_assignments ra
            JOIN public.community_responders cr ON cr.id = ra.responder_profile_id
            WHERE ra.sos_session_id = a.id
              AND cr.user_id = _user_id
              AND lower(ra.status::text) IN (
                'accepted', 'en_route', 'arrived', 'assisting', 'need_official_help', 'completed'
              )
          )
        )
      )
    )
  )
$function$;
