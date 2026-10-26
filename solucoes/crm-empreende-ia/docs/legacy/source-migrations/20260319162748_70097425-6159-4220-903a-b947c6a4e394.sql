
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_user_name text;
BEGIN
  v_user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Create profile
  INSERT INTO public.profiles (id, email, name, avatar_url)
  VALUES (
    NEW.id, NEW.email, v_user_name,
    NEW.raw_user_meta_data->>'avatar_url'
  );

  -- Auto-provision organization (single-tenant / white-label)
  -- Check if any org exists; if so, add user to it; otherwise create one
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

  IF v_org_id IS NULL THEN
    -- First user: create the default org
    INSERT INTO public.organizations (name, slug, settings)
    VALUES ('Minha Empresa', 'minha-empresa', '{"timezone":"America/Sao_Paulo","currency":"BRL"}'::jsonb)
    RETURNING id INTO v_org_id;

    -- First user is owner
    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (NEW.id, v_org_id, 'owner');
  ELSE
    -- Subsequent users get member role
    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (NEW.id, v_org_id, 'member');
  END IF;

  -- Link profile to org
  UPDATE public.profiles SET org_id = v_org_id WHERE id = NEW.id;

  RETURN NEW;
END;
$function$;
