ALTER TABLE public.emergency_calls REPLICA IDENTITY FULL;
ALTER TABLE public.call_signals REPLICA IDENTITY FULL;
ALTER TABLE public.sos_responder_offers REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_responder_offers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
