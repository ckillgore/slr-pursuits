-- ============================================================
-- Supabase advisor fixes (security + performance), 2026-09-25
--
-- Apply AFTER 20260922000000_security_hardening.sql.
-- Every statement below was written against the live catalog
-- (pg_policies / pg_proc / pg_constraint) as of this date.
--
-- SECURITY
-- 1. apply_template_to_pursuit and recalculate_due_dates are SECURITY
--    DEFINER and were executable by `anon` via /rest/v1/rpc/*, so anyone
--    holding the public anon key could write checklist tasks into any
--    pursuit or rewrite its due dates. Postgres grants EXECUTE to PUBLIC by
--    default, so revoke from PUBLIC/anon and grant back to authenticated
--    (the app calls apply_template_to_pursuit as a signed-in user).
--    Trigger/event-trigger functions (handle_new_user, rls_auto_enable)
--    don't need any API role to hold EXECUTE, so revoke those entirely.
-- 2. vw_rent_comp_summary was SECURITY DEFINER (owner's RLS) and SELECTable
--    by anon, exposing pursuit names and rent comp data without login.
--    Switch to security_invoker and revoke anon.
-- 3. default_predev_budget_line_items "Enable write access for admins" was
--    `... OR true`, i.e. every signed-in user could rewrite the portfolio
--    budget defaults. Restrict writes to owner/admin (the admin page is the
--    only writer; createPredevBudget only reads).
-- 4. Pin search_path on all public functions (function_search_path_mutable).
--
-- PERFORMANCE
-- 5. RLS policies calling auth.uid()/auth.role() per row → wrap in (select …)
--    so Postgres evaluates them once per statement. Policies that only
--    checked auth.role() = 'authenticated' on role PUBLIC become plain
--    TO authenticated policies (same access, no per-row function call).
-- 6. Covering indexes for the 36 unindexed foreign keys (speeds joins and
--    ON DELETE cascades / SET NULL checks on parent deletes).
-- 7. Drop 4 duplicate indexes.
-- ============================================================

-- ---------- 1. SECURITY DEFINER function execution ----------
REVOKE EXECUTE ON FUNCTION public.apply_template_to_pursuit(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.apply_template_to_pursuit(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.recalculate_due_dates(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.recalculate_due_dates(uuid) TO authenticated, service_role;

-- Used inside RLS policies, all of which are TO authenticated.
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_user_role() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- ---------- 2. Rent comp summary view ----------
ALTER VIEW public.vw_rent_comp_summary SET (security_invoker = true);
REVOKE ALL ON public.vw_rent_comp_summary FROM anon;
GRANT SELECT ON public.vw_rent_comp_summary TO authenticated;

-- ---------- 3. Budget defaults: admin-only writes ----------
DROP POLICY IF EXISTS "Enable write access for admins" ON public.default_predev_budget_line_items;
CREATE POLICY "Admins insert budget defaults" ON public.default_predev_budget_line_items
  FOR INSERT TO authenticated
  WITH CHECK ((select public.get_user_role()) IN ('owner', 'admin'));
CREATE POLICY "Admins update budget defaults" ON public.default_predev_budget_line_items
  FOR UPDATE TO authenticated
  USING ((select public.get_user_role()) IN ('owner', 'admin'))
  WITH CHECK ((select public.get_user_role()) IN ('owner', 'admin'));
CREATE POLICY "Admins delete budget defaults" ON public.default_predev_budget_line_items
  FOR DELETE TO authenticated
  USING ((select public.get_user_role()) IN ('owner', 'admin'));
-- (SELECT stays on the existing "Enable read access for all authenticated users".)

-- ---------- 4. Pin search_path ----------
ALTER FUNCTION public.apply_template_to_pursuit(uuid, uuid, uuid) SET search_path = public, extensions;
ALTER FUNCTION public.generate_short_id(integer)               SET search_path = public, extensions;
ALTER FUNCTION public.get_user_role()                          SET search_path = public;
ALTER FUNCTION public.handle_new_user()                        SET search_path = public;
ALTER FUNCTION public.log_task_activity()                      SET search_path = public;
ALTER FUNCTION public.recalculate_due_dates(uuid)              SET search_path = public;
ALTER FUNCTION public.set_report_templates_updated_at()        SET search_path = public;
ALTER FUNCTION public.trg_milestone_date_changed()             SET search_path = public;
ALTER FUNCTION public.trim_text_fields()                       SET search_path = public;
ALTER FUNCTION public.update_updated_at_column()               SET search_path = public;

-- ---------- 5. RLS: evaluate auth.* once per statement ----------
DROP POLICY IF EXISTS "Authenticated users can insert key_dates" ON public.key_dates;
CREATE POLICY "Authenticated users can insert key_dates" ON public.key_dates
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = created_by);

DROP POLICY IF EXISTS "Users can delete own comps" ON public.land_comps;
CREATE POLICY "Users can delete own comps" ON public.land_comps
  FOR DELETE TO authenticated USING ((select auth.uid()) = created_by);

DROP POLICY IF EXISTS "Users can insert comps" ON public.land_comps;
CREATE POLICY "Users can insert comps" ON public.land_comps
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = created_by);

DROP POLICY IF EXISTS "Authenticated users can manage budget amendments" ON public.predev_budget_amendments;
CREATE POLICY "Authenticated users can manage budget amendments" ON public.predev_budget_amendments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can manage funding partners" ON public.pursuit_funding_partners;
CREATE POLICY "Authenticated users can manage funding partners" ON public.pursuit_funding_partners
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can manage funding splits" ON public.pursuit_funding_splits;
CREATE POLICY "Authenticated users can manage funding splits" ON public.pursuit_funding_splits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can manage pursuit_land_comps" ON public.pursuit_land_comps;
CREATE POLICY "Authenticated users can manage pursuit_land_comps" ON public.pursuit_land_comps
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can manage pursuit_sale_comps" ON public.pursuit_sale_comps;
CREATE POLICY "Authenticated users can manage pursuit_sale_comps" ON public.pursuit_sale_comps
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own and shared templates" ON public.report_templates;
CREATE POLICY "Users can view own and shared templates" ON public.report_templates
  FOR SELECT TO authenticated
  USING (created_by = (select auth.uid()) OR is_shared = true);

DROP POLICY IF EXISTS "Users can update own templates or admin/owner can update shared" ON public.report_templates;
CREATE POLICY "Users can update own templates or admin/owner can update shared" ON public.report_templates
  FOR UPDATE TO authenticated
  USING (created_by = (select auth.uid())
         OR (is_shared = true AND (select public.get_user_role()) IN ('admin', 'owner')));

DROP POLICY IF EXISTS "Users can delete own or admin/owner can delete shared" ON public.report_templates;
CREATE POLICY "Users can delete own or admin/owner can delete shared" ON public.report_templates
  FOR DELETE TO authenticated
  USING (created_by = (select auth.uid())
         OR (is_shared = true AND (select public.get_user_role()) IN ('admin', 'owner')));

DROP POLICY IF EXISTS "Users can manage their own saved views" ON public.user_saved_views;
CREATE POLICY "Users can manage their own saved views" ON public.user_saved_views
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ---------- 6. Foreign key covering indexes ----------
CREATE INDEX IF NOT EXISTS idx_checklist_template_tasks_depends_on_task_id ON public.checklist_template_tasks (depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_created_by ON public.checklist_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_data_model_payroll_defaults_data_model_id ON public.data_model_payroll_defaults (data_model_id);
CREATE INDEX IF NOT EXISTS idx_data_model_templates_product_type_id ON public.data_model_templates (product_type_id);
CREATE INDEX IF NOT EXISTS idx_one_pagers_sub_product_type_id ON public.one_pagers (sub_product_type_id);
CREATE INDEX IF NOT EXISTS idx_pursuit_checklist_instances_applied_by ON public.pursuit_checklist_instances (applied_by);
CREATE INDEX IF NOT EXISTS idx_pursuit_checklist_instances_source_template_id ON public.pursuit_checklist_instances (source_template_id);
CREATE INDEX IF NOT EXISTS idx_pursuit_checklist_items_checked_by ON public.pursuit_checklist_items (checked_by);
CREATE INDEX IF NOT EXISTS idx_pursuit_checklist_tasks_assigned_external_party_id ON public.pursuit_checklist_tasks (assigned_external_party_id);
CREATE INDEX IF NOT EXISTS idx_pursuit_checklist_tasks_completed_by ON public.pursuit_checklist_tasks (completed_by);
CREATE INDEX IF NOT EXISTS idx_pursuit_checklist_tasks_depends_on_task_id ON public.pursuit_checklist_tasks (depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_pursuit_checklist_tasks_phase_id ON public.pursuit_checklist_tasks (phase_id);
CREATE INDEX IF NOT EXISTS idx_pursuit_land_comps_land_comp_id ON public.pursuit_land_comps (land_comp_id);
CREATE INDEX IF NOT EXISTS idx_pursuit_sale_comps_sale_comp_id ON public.pursuit_sale_comps (sale_comp_id);
CREATE INDEX IF NOT EXISTS idx_pursuit_stage_history_stage_id ON public.pursuit_stage_history (stage_id);
CREATE INDEX IF NOT EXISTS idx_pursuit_team_members_user_id ON public.pursuit_team_members (user_id);
CREATE INDEX IF NOT EXISTS idx_pursuits_primary_one_pager_id ON public.pursuits (primary_one_pager_id);
CREATE INDEX IF NOT EXISTS idx_report_templates_created_by ON public.report_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_sub_product_types_product_type_id ON public.sub_product_types (product_type_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_log_user_id ON public.task_activity_log (user_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_uploaded_by_external_party_id ON public.task_attachments (uploaded_by_external_party_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_uploaded_by ON public.task_attachments (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_task_notes_author_id ON public.task_notes (author_id);
CREATE INDEX IF NOT EXISTS idx_task_notes_parent_note_id ON public.task_notes (parent_note_id);
CREATE INDEX IF NOT EXISTS idx_pursuit_funding_splits_partner_id ON public.pursuit_funding_splits (partner_id);
CREATE INDEX IF NOT EXISTS idx_hellodata_fetch_log_fetched_by ON public.hellodata_fetch_log (fetched_by);
CREATE INDEX IF NOT EXISTS idx_key_dates_created_by ON public.key_dates (created_by);
CREATE INDEX IF NOT EXISTS idx_land_comps_created_by ON public.land_comps (created_by);
CREATE INDEX IF NOT EXISTS idx_one_pagers_created_by ON public.one_pagers (created_by);
CREATE INDEX IF NOT EXISTS idx_predev_budgets_created_by ON public.predev_budgets (created_by);
CREATE INDEX IF NOT EXISTS idx_pursuit_land_comps_added_by ON public.pursuit_land_comps (added_by);
CREATE INDEX IF NOT EXISTS idx_pursuit_rent_comps_added_by ON public.pursuit_rent_comps (added_by);
CREATE INDEX IF NOT EXISTS idx_pursuit_sale_comps_added_by ON public.pursuit_sale_comps (added_by);
CREATE INDEX IF NOT EXISTS idx_pursuit_stage_history_changed_by ON public.pursuit_stage_history (changed_by);
CREATE INDEX IF NOT EXISTS idx_pursuits_created_by ON public.pursuits (created_by);
CREATE INDEX IF NOT EXISTS idx_sale_comps_created_by ON public.sale_comps (created_by);

-- ---------- 7. Duplicate indexes ----------
DROP INDEX IF EXISTS public.idx_hellodata_concessions_property_id;  -- dup of idx_hellodata_concessions_property
DROP INDEX IF EXISTS public.idx_hellodata_units_property_id;        -- dup of idx_hellodata_units_property
DROP INDEX IF EXISTS public.idx_pursuit_rent_comps_property_id;     -- dup of idx_pursuit_rent_comps_property
DROP INDEX IF EXISTS public.idx_pursuit_rent_comps_pursuit_id;      -- dup of idx_pursuit_rent_comps_pursuit
