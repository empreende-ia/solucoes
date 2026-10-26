-- Re-run handle_new_user logic for any auth.users that don't have a profile yet
DO $$
DECLARE
  r RECORD;
  v_org_id uuid;
  v_user_name text;
BEGIN
  FOR r IN 
    SELECT u.id, u.email, u.raw_user_meta_data
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
  LOOP
    v_user_name := COALESCE(
      r.raw_user_meta_data->>'full_name',
      r.raw_user_meta_data->>'name',
      split_part(r.email, '@', 1)
    );

    INSERT INTO public.profiles (id, email, name)
    VALUES (r.id, r.email, v_user_name);

    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

    IF v_org_id IS NULL THEN
      INSERT INTO public.organizations (name, slug, settings)
      VALUES ('Minha Empresa', 'minha-empresa', '{"timezone":"America/Sao_Paulo","currency":"BRL"}'::jsonb)
      RETURNING id INTO v_org_id;

      INSERT INTO public.user_roles (user_id, org_id, role)
      VALUES (r.id, v_org_id, 'owner');
    ELSE
      INSERT INTO public.user_roles (user_id, org_id, role)
      VALUES (r.id, v_org_id, 'member')
      ON CONFLICT DO NOTHING;
    END IF;

    UPDATE public.profiles SET org_id = v_org_id WHERE id = r.id;
  END LOOP;
END;
$$;