-- ============================================================
-- Security hardening (auth / RLS)
--
-- 1. Stop users from escalating their own role / re-activating themselves.
--    The "Users update own profile" policy (001_auth_rls.sql) lets any
--    authenticated user UPDATE their own user_profiles row with no column
--    restriction, so `update user_profiles set role = 'owner' where id = auth.uid()`
--    via PostgREST succeeds today.
-- 2. handle_new_user() trusted raw_user_meta_data->>'role'. With public
--    sign-ups enabled, anyone could call auth.signUp({ options: { data: { role: 'owner' } } }).
--    Only honor the metadata role for invited users, and never 'owner'.
-- 3. task-files storage policies had no role restriction, so the public anon
--    key could list/read/upload/overwrite/delete every task attachment.
-- 4. external_task_parties and pursuit_team_members were readable by anon
--    (FOR SELECT USING (true) with no TO clause). The external portal reads
--    through the service-role client, so anon access is not needed.
-- 5. Pin search_path on the SECURITY DEFINER helper.
-- ============================================================

-- ---------- 1. Guard privileged user_profiles columns ----------
CREATE OR REPLACE FUNCTION public.guard_user_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- auth.uid() is NULL for the service role and for direct SQL, which are
  -- allowed (admin API routes use the service-role client).
  IF auth.uid() IS NOT NULL
     AND (NEW.role IS DISTINCT FROM OLD.role
          OR NEW.is_active IS DISTINCT FROM OLD.is_active
          OR NEW.id IS DISTINCT FROM OLD.id)
     AND COALESCE(public.get_user_role(), '') <> 'owner'
  THEN
    RAISE EXCEPTION 'Only the owner can change role or active status'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_user_profile_privileged_columns ON public.user_profiles;
CREATE TRIGGER guard_user_profile_privileged_columns
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_profile_privileged_columns();

-- ---------- 2. Don't trust self-supplied role metadata on sign-up ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role text := NEW.raw_user_meta_data->>'role';
  final_role text := 'member';
BEGIN
  -- Only invited users (created via auth.admin.inviteUserByEmail by the owner)
  -- may carry a role from metadata, and never 'owner'.
  IF NEW.invited_at IS NOT NULL AND requested_role IN ('admin', 'member') THEN
    final_role := requested_role;
  END IF;

  INSERT INTO public.user_profiles (id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    final_role,
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ---------- 3. task-files storage: authenticated users only ----------
DROP POLICY IF EXISTS "task_files_select" ON storage.objects;
DROP POLICY IF EXISTS "task_files_insert" ON storage.objects;
DROP POLICY IF EXISTS "task_files_update" ON storage.objects;
DROP POLICY IF EXISTS "task_files_delete" ON storage.objects;

CREATE POLICY "task_files_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'task-files');
CREATE POLICY "task_files_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'task-files');
CREATE POLICY "task_files_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'task-files') WITH CHECK (bucket_id = 'task-files');
CREATE POLICY "task_files_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'task-files');

-- ---------- 4. No anonymous reads of team / external party data ----------
DROP POLICY IF EXISTS "Enable read access for all users" ON public.pursuit_team_members;
CREATE POLICY "Enable read access for authenticated users" ON public.pursuit_team_members
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable read access for all users" ON public.external_task_parties;
CREATE POLICY "Enable read access for authenticated users" ON public.external_task_parties
  FOR SELECT TO authenticated USING (true);

-- ---------- 5. Pin search_path on SECURITY DEFINER helper ----------
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid()
$$;
