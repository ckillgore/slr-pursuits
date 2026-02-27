-- ============================================================
-- SLR Pursuits: Auth & RLS Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add role column to existing user_profiles table
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';

-- Add constraint separately (IF NOT EXISTS not supported for constraints)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_role_check'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_role_check
      CHECK (role IN ('owner', 'admin', 'member'));
  END IF;
END $$;

-- 2. Helper function: get current user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. Auto-create profile on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'member'),
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 4. Drop ALL "Anon full access" policies
-- ============================================================

DROP POLICY IF EXISTS "Anon full access" ON public.pursuits;
DROP POLICY IF EXISTS "Anon full access" ON public.one_pagers;
DROP POLICY IF EXISTS "Anon full access" ON public.one_pager_unit_mix;
DROP POLICY IF EXISTS "Anon full access" ON public.one_pager_payroll;
DROP POLICY IF EXISTS "Anon full access" ON public.one_pager_soft_cost_detail;
DROP POLICY IF EXISTS "Anon full access" ON public.product_types;
DROP POLICY IF EXISTS "Anon full access" ON public.sub_product_types;
DROP POLICY IF EXISTS "Anon full access" ON public.pursuit_stages;
DROP POLICY IF EXISTS "Anon full access" ON public.pursuit_stage_history;
DROP POLICY IF EXISTS "Anon full access" ON public.data_model_templates;
DROP POLICY IF EXISTS "Anon full access" ON public.data_model_payroll_defaults;
DROP POLICY IF EXISTS "Anon full access" ON public.user_profiles;

-- ============================================================
-- 5. Fix "Authenticated full access" policies on data tables
--    (these already exist, just making sure they're correct)
-- ============================================================

-- Data tables: keep existing "Authenticated full access" for ALL ops
-- These tables already have the right policy: pursuits, one_pagers,
-- one_pager_unit_mix, one_pager_payroll, one_pager_soft_cost_detail,
-- pursuit_stage_history. No changes needed.

-- ============================================================
-- 6. Admin-only write policies on config tables
-- ============================================================

-- For config tables, we need:
--   SELECT: all authenticated
--   INSERT/UPDATE/DELETE: owner or admin only

-- First, drop existing wide-open policies on config tables
DROP POLICY IF EXISTS "Authenticated full access" ON public.product_types;
DROP POLICY IF EXISTS "Authenticated full access" ON public.sub_product_types;
DROP POLICY IF EXISTS "Authenticated full access" ON public.pursuit_stages;
DROP POLICY IF EXISTS "Authenticated full access" ON public.data_model_templates;
DROP POLICY IF EXISTS "Authenticated full access" ON public.data_model_payroll_defaults;

-- product_types
CREATE POLICY "Authenticated read" ON public.product_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write" ON public.product_types
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('owner', 'admin'))
  WITH CHECK (public.get_user_role() IN ('owner', 'admin'));

-- sub_product_types
CREATE POLICY "Authenticated read" ON public.sub_product_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write" ON public.sub_product_types
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('owner', 'admin'))
  WITH CHECK (public.get_user_role() IN ('owner', 'admin'));

-- pursuit_stages
CREATE POLICY "Authenticated read" ON public.pursuit_stages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write" ON public.pursuit_stages
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('owner', 'admin'))
  WITH CHECK (public.get_user_role() IN ('owner', 'admin'));

-- data_model_templates
CREATE POLICY "Authenticated read" ON public.data_model_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write" ON public.data_model_templates
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('owner', 'admin'))
  WITH CHECK (public.get_user_role() IN ('owner', 'admin'));

-- data_model_payroll_defaults
CREATE POLICY "Authenticated read" ON public.data_model_payroll_defaults
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write" ON public.data_model_payroll_defaults
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('owner', 'admin'))
  WITH CHECK (public.get_user_role() IN ('owner', 'admin'));

-- ============================================================
-- 7. user_profiles policies
-- ============================================================

-- Drop existing wide-open policy
DROP POLICY IF EXISTS "Authenticated full access" ON public.user_profiles;

-- All authenticated can read all profiles (for avatars, names, etc.)
CREATE POLICY "Authenticated read all profiles" ON public.user_profiles
  FOR SELECT TO authenticated USING (true);

-- Users can update their own profile (name, etc.)
CREATE POLICY "Users update own profile" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Owner can update any profile (role changes, deactivation)
CREATE POLICY "Owner update any profile" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (public.get_user_role() = 'owner')
  WITH CHECK (public.get_user_role() = 'owner');

-- Service role handles INSERT (via trigger), so no INSERT policy needed
-- for regular users. The trigger runs as SECURITY DEFINER.

-- ============================================================
-- 8. Set owner email after first sign-up
-- (Run this AFTER ckillgore@streetlights.com creates their account)
-- ============================================================
-- UPDATE public.user_profiles
--   SET role = 'owner'
--   WHERE email = 'ckillgore@streetlights.com';
