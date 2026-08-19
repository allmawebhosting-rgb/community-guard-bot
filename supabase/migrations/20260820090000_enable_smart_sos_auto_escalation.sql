-- Keep Smart SOS foreground monitoring opt-in, but automatically escalate a
-- high-confidence unanswered safety check once the user enables Smart SOS.
ALTER TABLE public.smart_sos_settings
  ALTER COLUMN auto_escalation SET DEFAULT true;

UPDATE public.smart_sos_settings
SET auto_escalation = true,
    updated_at = now()
WHERE auto_escalation = false;