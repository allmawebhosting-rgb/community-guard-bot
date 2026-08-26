INSERT INTO public.user_roles (user_id, role)
VALUES ('d94736b0-4a30-4d71-afaf-dc1fbdd10d05', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

DROP POLICY IF EXISTS "Officers view directory" ON public.officer_profiles;
CREATE POLICY "Officers view directory"
ON public.officer_profiles
FOR SELECT
TO authenticated
USING (public.is_verified_officer(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Command staff insert officers" ON public.officer_profiles;
CREATE POLICY "Command staff insert officers"
ON public.officer_profiles
FOR INSERT
TO authenticated
WITH CHECK (public.is_command_staff(auth.uid()));