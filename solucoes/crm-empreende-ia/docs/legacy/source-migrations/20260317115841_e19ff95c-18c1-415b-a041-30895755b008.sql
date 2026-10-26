
CREATE OR REPLACE FUNCTION public.create_organization_for_user(
  p_user_id uuid, p_name text, p_slug text, p_settings jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id uuid;
BEGIN
  INSERT INTO public.organizations (name, slug, settings)
  VALUES (p_name, p_slug, p_settings)
  RETURNING id INTO v_org_id;

  INSERT INTO public.user_roles (user_id, org_id, role)
  VALUES (p_user_id, v_org_id, 'owner');

  UPDATE public.profiles SET org_id = v_org_id WHERE id = p_user_id;

  RETURN v_org_id;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
