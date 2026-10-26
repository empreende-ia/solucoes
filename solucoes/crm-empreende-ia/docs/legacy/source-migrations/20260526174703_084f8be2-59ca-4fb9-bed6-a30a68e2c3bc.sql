
CREATE OR REPLACE FUNCTION public.audit_user_visibility(_user_id uuid, _org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role text;
  v_scope text;
  v_dir_ids uuid[];
  v_team_ids uuid[];
  v_allowed uuid[];
  v_deals int;
  v_contacts int;
  v_activities int;
BEGIN
  -- Guard: caller must be owner/admin of the org
  IF NOT (public.has_role(v_caller, _org_id, 'owner'::app_role)
       OR public.has_role(v_caller, _org_id, 'admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT role::text INTO v_role
  FROM public.user_roles
  WHERE user_id = _user_id AND org_id = _org_id
  LIMIT 1;

  v_role := COALESCE(v_role, 'member');

  v_scope := CASE v_role
    WHEN 'owner' THEN 'org'
    WHEN 'admin' THEN 'org'
    WHEN 'director' THEN 'directorate'
    WHEN 'manager' THEN 'team'
    ELSE 'own'
  END;

  SELECT public.get_user_directorate_ids(_user_id) INTO v_dir_ids;

  SELECT COALESCE(array_agg(DISTINCT t.id), '{}')::uuid[]
  INTO v_team_ids
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id AND t.org_id = _org_id
  WHERE tm.user_id = _user_id;

  IF v_scope = 'org' THEN
    SELECT COALESCE(array_agg(DISTINCT p.id), '{}')::uuid[]
    INTO v_allowed
    FROM public.profiles p WHERE p.org_id = _org_id;
  ELSIF v_scope = 'directorate' THEN
    v_allowed := public.get_directorate_user_ids(_user_id, _org_id) || ARRAY[_user_id]::uuid[];
  ELSIF v_scope = 'team' THEN
    v_allowed := public.get_team_user_ids(_user_id, _org_id) || ARRAY[_user_id]::uuid[];
  ELSE
    v_allowed := ARRAY[_user_id]::uuid[];
  END IF;

  IF v_scope = 'org' THEN
    SELECT count(*) INTO v_deals     FROM public.deals      WHERE org_id = _org_id;
    SELECT count(*) INTO v_contacts  FROM public.contacts   WHERE org_id = _org_id;
    SELECT count(*) INTO v_activities FROM public.activities WHERE org_id = _org_id;
  ELSE
    SELECT count(*) INTO v_deals     FROM public.deals      WHERE org_id = _org_id AND owner_id = ANY(v_allowed);
    SELECT count(*) INTO v_contacts  FROM public.contacts   WHERE org_id = _org_id AND owner_id = ANY(v_allowed);
    SELECT count(*) INTO v_activities FROM public.activities WHERE org_id = _org_id AND user_id  = ANY(v_allowed);
  END IF;

  RETURN jsonb_build_object(
    'user_id', _user_id,
    'role', v_role,
    'scope', v_scope,
    'directorate_ids', to_jsonb(v_dir_ids),
    'team_ids', to_jsonb(v_team_ids),
    'allowed_user_ids', to_jsonb(v_allowed),
    'counts', jsonb_build_object(
      'deals', v_deals,
      'contacts', v_contacts,
      'activities', v_activities
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_user_visibility(uuid, uuid) TO authenticated;
