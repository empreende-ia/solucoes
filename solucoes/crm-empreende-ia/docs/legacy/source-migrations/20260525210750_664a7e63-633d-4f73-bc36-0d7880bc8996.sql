CREATE POLICY "Org admins manage secrets"
ON public.org_secrets
FOR ALL
USING (
  has_role(auth.uid(), org_id, 'owner'::app_role) OR
  has_role(auth.uid(), org_id, 'admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), org_id, 'owner'::app_role) OR
  has_role(auth.uid(), org_id, 'admin'::app_role)
);