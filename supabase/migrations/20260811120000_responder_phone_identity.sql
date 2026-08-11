-- Allow an SOS requester to identify only the responders matched to their own
-- emergency by the phone number they opted into their responder profile.
-- Exact responder locations and unrelated responder records remain unavailable.

create or replace function public.get_sos_responder_contacts(
  p_sos_activity_id uuid
)
returns table (
  offer_id uuid,
  responder_id uuid,
  phone text
)
language sql
security definer
set search_path = public
as $$
  select
    offers.id as offer_id,
    offers.responder_id,
    responder.phone
  from public.sos_responder_offers offers
  join public.community_responders responder
    on responder.user_id = offers.responder_id
  where offers.sos_activity_id = p_sos_activity_id
    and responder.phone is not null
    and responder.phone_verification_status = 'verified'
    and exists (
      select 1
      from public.safety_activity activity
      where activity.id = offers.sos_activity_id
        and activity.user_id = auth.uid()
    );
$$;

revoke all on function public.get_sos_responder_contacts(uuid) from public;
grant execute on function public.get_sos_responder_contacts(uuid) to authenticated;