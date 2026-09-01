revoke all on function public.list_sos_rooms() from public, anon;
revoke all on function public.get_sos_room(uuid) from public, anon;
revoke all on function public.can_access_sos_room(uuid, uuid) from public, anon;
grant execute on function public.list_sos_rooms() to authenticated;
grant execute on function public.get_sos_room(uuid) to authenticated;
grant execute on function public.can_access_sos_room(uuid, uuid) to authenticated;