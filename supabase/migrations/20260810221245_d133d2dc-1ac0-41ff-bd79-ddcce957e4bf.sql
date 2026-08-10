ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_step smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS location_mode text NOT NULL DEFAULT 'approximate',
  ADD COLUMN IF NOT EXISTS safety_plan jsonb NOT NULL DEFAULT '{}'::jsonb;