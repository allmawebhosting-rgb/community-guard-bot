BEGIN;

-- Replaces the first draft table; it was never populated (Google keys were not configured yet).
DROP TABLE IF EXISTS public.user_email_connections;

-- A user's own Gmail (Google OAuth, gmail.send only). Tokens are AES-GCM encrypted by the
-- server with GMAIL_TOKEN_ENC_KEY and are only ever read with the service role.
CREATE TABLE IF NOT EXISTS public.gmail_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  access_token_encrypted text NULL,
  expires_at timestamptz NULL,
  scope text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gmail_connections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.gmail_connections FROM anon, authenticated;
-- Signed-in users may see only whether they are connected and which address; never the tokens.
GRANT SELECT (user_id, google_email, created_at) ON public.gmail_connections TO authenticated;

DROP POLICY IF EXISTS "Users read own gmail connection status" ON public.gmail_connections;
CREATE POLICY "Users read own gmail connection status"
  ON public.gmail_connections
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Send log. The message body is deliberately not stored.
CREATE TABLE IF NOT EXISTS public.email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  subject text NOT NULL,
  gmail_message_id text NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_sends_user_created_idx
  ON public.email_sends (user_id, created_at DESC);

ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.email_sends FROM anon, authenticated;
GRANT SELECT ON public.email_sends TO authenticated;

DROP POLICY IF EXISTS "Users read own email sends" ON public.email_sends;
CREATE POLICY "Users read own email sends"
  ON public.email_sends
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

COMMIT;
