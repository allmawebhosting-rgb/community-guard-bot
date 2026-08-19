ALTER TABLE public.emergency_calls
  DROP CONSTRAINT IF EXISTS emergency_calls_provider_mode_check;

ALTER TABLE public.emergency_calls
  ADD CONSTRAINT emergency_calls_provider_mode_check
  CHECK (provider_mode IN ('demo', 'webrtc', 'zego'));

ALTER TABLE public.emergency_calls
  DROP CONSTRAINT IF EXISTS emergency_calls_connected_requires_provider;

ALTER TABLE public.emergency_calls
  ADD CONSTRAINT emergency_calls_connected_requires_provider
  CHECK (
    status <> 'connected'
    OR (provider_mode IN ('webrtc', 'zego') AND provider_confirmed = true)
  );