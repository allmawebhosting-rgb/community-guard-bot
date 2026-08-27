-- Allow the SOS owner to persist the GPS fix captured after activation.
CREATE POLICY "Users can update their own activity"
ON public.safety_activity
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);