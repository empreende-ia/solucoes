
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  permission text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_id, role, permission)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view role permissions"
  ON public.role_permissions FOR SELECT
  USING (user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "Admins can insert role permissions"
  ON public.role_permissions FOR INSERT
  WITH CHECK (has_role(auth.uid(), org_id, 'owner'::app_role) OR has_role(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Admins can update role permissions"
  ON public.role_permissions FOR UPDATE
  USING (has_role(auth.uid(), org_id, 'owner'::app_role) OR has_role(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Admins can delete role permissions"
  ON public.role_permissions FOR DELETE
  USING (has_role(auth.uid(), org_id, 'owner'::app_role) OR has_role(auth.uid(), org_id, 'admin'::app_role));
