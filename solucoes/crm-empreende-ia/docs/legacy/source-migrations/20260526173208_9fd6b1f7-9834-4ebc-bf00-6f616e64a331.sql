
-- 1) directorates
CREATE TABLE public.directorates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.directorates TO authenticated;
GRANT ALL ON public.directorates TO service_role;
ALTER TABLE public.directorates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view directorates" ON public.directorates
  FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Admins manage directorates ins" ON public.directorates
  FOR INSERT WITH CHECK (has_role(auth.uid(), org_id, 'owner') OR has_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins manage directorates upd" ON public.directorates
  FOR UPDATE USING (has_role(auth.uid(), org_id, 'owner') OR has_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins manage directorates del" ON public.directorates
  FOR DELETE USING (has_role(auth.uid(), org_id, 'owner') OR has_role(auth.uid(), org_id, 'admin'));

-- 2) directorate_members
CREATE TABLE public.directorate_members (
  directorate_id uuid NOT NULL REFERENCES public.directorates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (directorate_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.directorate_members TO authenticated;
GRANT ALL ON public.directorate_members TO service_role;
ALTER TABLE public.directorate_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view dm" ON public.directorate_members
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.directorates d WHERE d.id = directorate_id AND user_belongs_to_org(auth.uid(), d.org_id)));
CREATE POLICY "Admins manage dm ins" ON public.directorate_members
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.directorates d WHERE d.id = directorate_id AND (has_role(auth.uid(), d.org_id, 'owner') OR has_role(auth.uid(), d.org_id, 'admin'))));
CREATE POLICY "Admins manage dm del" ON public.directorate_members
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.directorates d WHERE d.id = directorate_id AND (has_role(auth.uid(), d.org_id, 'owner') OR has_role(auth.uid(), d.org_id, 'admin'))));

-- 3) teams.directorate_id
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS directorate_id uuid REFERENCES public.directorates(id) ON DELETE SET NULL;

-- 4) helper functions
CREATE OR REPLACE FUNCTION public.get_user_directorate_ids(_user_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(directorate_id), '{}')::uuid[] FROM public.directorate_members WHERE user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.get_directorate_user_ids(_user_id uuid, _org_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT tm.user_id), '{}')::uuid[]
  FROM public.directorate_members dm
  JOIN public.directorates d ON d.id = dm.directorate_id AND d.org_id = _org_id
  JOIN public.teams t ON t.directorate_id = d.id
  JOIN public.team_members tm ON tm.team_id = t.id
  WHERE dm.user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.get_team_user_ids(_user_id uuid, _org_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT tm2.user_id), '{}')::uuid[]
  FROM public.team_members tm1
  JOIN public.teams t ON t.id = tm1.team_id AND t.org_id = _org_id
  JOIN public.team_members tm2 ON tm2.team_id = tm1.team_id
  WHERE tm1.user_id = _user_id
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_directorate_ids(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_directorate_user_ids(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_team_user_ids(uuid, uuid) FROM anon;

-- 5) Update deals/contacts SELECT policies to add Director branch
DROP POLICY IF EXISTS deals_select_by_role ON public.deals;
CREATE POLICY deals_select_by_role ON public.deals FOR SELECT USING (
  CASE
    WHEN has_role(auth.uid(), org_id, 'owner') OR has_role(auth.uid(), org_id, 'admin') THEN true
    WHEN has_role(auth.uid(), org_id, 'director') AND owner_id = ANY (public.get_directorate_user_ids(auth.uid(), org_id)) THEN true
    WHEN has_role(auth.uid(), org_id, 'manager') AND owner_id = ANY (public.get_team_user_ids(auth.uid(), org_id)) THEN true
    WHEN owner_id = auth.uid() THEN true
    ELSE false
  END
);

DROP POLICY IF EXISTS contacts_select_by_role ON public.contacts;
CREATE POLICY contacts_select_by_role ON public.contacts FOR SELECT USING (
  CASE
    WHEN has_role(auth.uid(), org_id, 'owner') OR has_role(auth.uid(), org_id, 'admin') THEN true
    WHEN has_role(auth.uid(), org_id, 'director') AND owner_id = ANY (public.get_directorate_user_ids(auth.uid(), org_id)) THEN true
    WHEN has_role(auth.uid(), org_id, 'manager') AND owner_id = ANY (public.get_team_user_ids(auth.uid(), org_id)) THEN true
    WHEN owner_id = auth.uid() THEN true
    ELSE false
  END
);
