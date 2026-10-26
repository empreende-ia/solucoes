-- Recreate handle_new_user trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for any auth user that already has a role but no profile row
INSERT INTO public.profiles (id, email, name, org_id, onboarding_completed, onboarding_step)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email,'@',1)),
  ur.org_id,
  false,
  1
FROM auth.users u
JOIN public.user_roles ur ON ur.user_id = u.id
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);