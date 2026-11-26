BEGIN;

-- A user's own mailbox (Gmail via Google OAuth) so Allma can send emails from their address.
-- Only the server (service role) reads or writes this table; the refresh token is stored encrypted.
CREATE TABLE IF NOT EXISTS public.user_email_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'google' CHECK (provider IN ('google')),
  email text NOT NULL,
  refresh_token_enc text NOT NULL,
  scopes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_email_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_email_connections FROM anon, authenticated;

COMMIT;
