-- ============================================================
-- Activity log + presence
-- ============================================================
-- Before this, "activity" was a count of rows each person had created, and
-- "last sign in" only moved on a password sign-in (sessions refresh silently
-- for weeks). This adds:
--   activity_log       — who created / changed / deleted what, written by
--                        triggers so every write path is covered. Bursts of
--                        edits to one record by one person (autosave) fold
--                        into one entry with a change count.
--   user_presence      — when each person last used the app
--   user_active_days   — which days each person used the app
--   touch_presence()   — called by the app on load and when the tab regains focus

-- ── Tables ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.activity_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  entity_type text NOT NULL,
  entity_id uuid,
  entity_label text,
  pursuit_id uuid,
  fields text[] NOT NULL DEFAULT '{}',
  change_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_log_last_at_idx ON public.activity_log (last_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_actor_idx ON public.activity_log (actor_id, last_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_pursuit_idx ON public.activity_log (pursuit_id, last_at DESC) WHERE pursuit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activity_log_coalesce_idx ON public.activity_log (actor_id, entity_type, entity_id, last_at DESC);

CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_active_days (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- Signed-in users can read the activity log (it describes data they can already
-- see); presence is for owners/admins and each person's own row. Rows are only
-- written by the SECURITY DEFINER functions below.
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_active_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read activity" ON public.activity_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins or self read presence" ON public.user_presence
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.get_user_role() IN ('owner', 'admin'));
CREATE POLICY "Admins or self read active days" ON public.user_active_days
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.get_user_role() IN ('owner', 'admin'));

-- ── Presence ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_presence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN; END IF;
  INSERT INTO user_presence (user_id) VALUES (v_user)
  ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now()
    WHERE user_presence.last_seen_at < now() - interval '1 minute';
  -- The team works in US Central; a day is a Central calendar day
  INSERT INTO user_active_days (user_id, day)
  VALUES (v_user, (now() AT TIME ZONE 'America/Chicago')::date)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_presence() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_presence() TO authenticated;

-- ── Activity trigger ────────────────────────────────────────
-- Arguments:
--   0 entity_type   what the entry is about ('pursuit', 'one_pager', …)
--   1 id column     column holding that entity's id ('id', or the parent's id column)
--   2 label column  column with a display name on this row ('' if none)
--   3 pursuit column column with the pursuit id on this row ('' if none)
--   4 mode          'self'   — the row is the entity
--                   'parent' — the row is part of a parent entity (a unit-mix row of
--                              a one-pager); logged as an update of the parent
--   5 field         (parent mode) the part that changed, e.g. 'unit_mix'
--   6 parent table  (parent mode) looked up for the label / pursuit and to skip
--                   rows deleted along with their parent
--   7 parent label column, 8 parent pursuit column ('' if none)

CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_type text := TG_ARGV[0];
  v_mode text := TG_ARGV[4];
  v_row jsonb;
  v_old jsonb;
  v_id uuid;
  v_label text;
  v_pursuit uuid;
  v_action text;
  v_fields text[] := '{}';
  v_existing bigint;
  v_found boolean;
BEGIN
  -- Service-role jobs (crons, imports) have no user to attribute
  IF v_actor IS NULL THEN RETURN NULL; END IF;

  v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_id := NULLIF(v_row ->> TG_ARGV[1], '')::uuid;
  IF TG_ARGV[2] <> '' THEN v_label := v_row ->> TG_ARGV[2]; END IF;
  IF TG_ARGV[3] <> '' THEN v_pursuit := NULLIF(v_row ->> TG_ARGV[3], '')::uuid; END IF;

  IF v_mode = 'parent' THEN
    v_action := 'updated';
    v_fields := ARRAY[TG_ARGV[5]];
    EXECUTE format(
      'SELECT true, %s, %s FROM %I WHERE id = $1',
      CASE WHEN TG_ARGV[7] <> '' THEN format('%I::text', TG_ARGV[7]) ELSE 'NULL::text' END,
      CASE WHEN TG_ARGV[8] = 'id' THEN 'id' WHEN TG_ARGV[8] <> '' THEN format('%I', TG_ARGV[8]) ELSE 'NULL::uuid' END,
      TG_ARGV[6]
    ) INTO v_found, v_label, v_pursuit USING v_id;
    -- Parent gone (cascade delete): the parent's own entry covers it
    IF v_found IS NOT TRUE THEN RETURN NULL; END IF;
  ELSE
    v_action := CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'updated' ELSE 'deleted' END;
    IF TG_OP = 'UPDATE' THEN
      v_old := to_jsonb(OLD);
      SELECT COALESCE(array_agg(n.key ORDER BY n.key), '{}') INTO v_fields
      FROM jsonb_each(v_row) n
      WHERE n.value IS DISTINCT FROM v_old -> n.key
        AND n.key NOT IN ('updated_at', 'created_at', 'sort_order', 'stage_changed_at', 'updated_by');
      -- Reordering alone isn't worth an entry
      IF cardinality(v_fields) = 0 THEN RETURN NULL; END IF;
    END IF;
    IF v_type = 'pursuit' THEN v_pursuit := v_id; END IF;
    -- Deleted along with its pursuit: the pursuit's own entry covers it
    IF TG_OP = 'DELETE' AND v_type <> 'pursuit' AND v_pursuit IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pursuits WHERE id = v_pursuit) THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Friendlier labels where the row has no name of its own
  IF v_label IS NULL AND v_type = 'key_date' THEN
    SELECT name INTO v_label FROM key_date_types WHERE id = NULLIF(v_row ->> 'key_date_type_id', '')::uuid;
  ELSIF v_label IS NULL AND v_type = 'tax_rate' THEN
    v_label := concat_ws(', ', NULLIF(v_row ->> 'city', ''), NULLIF(v_row ->> 'county', ''), NULLIF(v_row ->> 'state', ''));
  ELSIF v_label IS NULL AND v_type = 'predev_budget' THEN
    v_label := 'Pre-dev budget';
  END IF;

  -- A burst of edits to one record by one person is one entry
  IF v_action = 'updated' THEN
    SELECT id INTO v_existing FROM activity_log
    WHERE actor_id = v_actor AND entity_type = v_type AND entity_id IS NOT DISTINCT FROM v_id
      AND action IN ('created', 'updated') AND last_at > now() - interval '30 minutes'
    ORDER BY last_at DESC LIMIT 1;
    IF FOUND THEN
      UPDATE activity_log SET
        last_at = now(),
        change_count = change_count + 1,
        fields = (SELECT COALESCE(array_agg(DISTINCT f ORDER BY f), '{}') FROM unnest(fields || v_fields) f),
        entity_label = COALESCE(v_label, entity_label)
      WHERE id = v_existing;
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO activity_log (actor_id, action, entity_type, entity_id, entity_label, pursuit_id, fields)
  VALUES (v_actor, v_action, v_type, v_id, v_label, v_pursuit, v_fields);
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_activity() FROM PUBLIC, anon, authenticated;

-- ── Triggers ────────────────────────────────────────────────

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    -- Pursuits and their parts
    ('pursuits',                 ARRAY['pursuit', 'id', 'name', 'id', 'self']),
    ('pursuit_rent_comps',       ARRAY['pursuit', 'pursuit_id', '', '', 'parent', 'rent_comps', 'pursuits', 'name', 'id']),
    ('pursuit_land_comps',       ARRAY['pursuit', 'pursuit_id', '', '', 'parent', 'land_comps', 'pursuits', 'name', 'id']),
    ('pursuit_sale_comps',       ARRAY['pursuit', 'pursuit_id', '', '', 'parent', 'sale_comps', 'pursuits', 'name', 'id']),
    ('pursuit_milestones',       ARRAY['pursuit', 'pursuit_id', '', '', 'parent', 'milestones', 'pursuits', 'name', 'id']),
    ('pursuit_funding_partners', ARRAY['pursuit', 'pursuit_id', '', '', 'parent', 'funding_partners', 'pursuits', 'name', 'id']),
    ('pursuit_team_members',     ARRAY['pursuit', 'pursuit_id', '', '', 'parent', 'team', 'pursuits', 'name', 'id']),
    ('pursuit_accounting_entities', ARRAY['pursuit', 'pursuit_id', '', '', 'parent', 'accounting', 'pursuits', 'name', 'id']),
    -- One-pagers and their parts
    ('one_pagers',               ARRAY['one_pager', 'id', 'name', 'pursuit_id', 'self']),
    ('one_pager_unit_mix',       ARRAY['one_pager', 'one_pager_id', '', '', 'parent', 'unit_mix', 'one_pagers', 'name', 'pursuit_id']),
    ('one_pager_payroll',        ARRAY['one_pager', 'one_pager_id', '', '', 'parent', 'payroll', 'one_pagers', 'name', 'pursuit_id']),
    ('one_pager_other_income',   ARRAY['one_pager', 'one_pager_id', '', '', 'parent', 'other_income', 'one_pagers', 'name', 'pursuit_id']),
    ('one_pager_soft_cost_detail', ARRAY['one_pager', 'one_pager_id', '', '', 'parent', 'soft_costs', 'one_pagers', 'name', 'pursuit_id']),
    ('unit_premiums',            ARRAY['one_pager', 'one_pager_id', '', '', 'parent', 'unit_premiums', 'one_pagers', 'name', 'pursuit_id']),
    ('one_pager_versions',       ARRAY['one_pager', 'one_pager_id', '', '', 'parent', 'saved_version', 'one_pagers', 'name', 'pursuit_id']),
    -- Budgets, dates, tasks
    ('predev_budgets',           ARRAY['predev_budget', 'id', '', 'pursuit_id', 'self']),
    ('predev_budget_line_items', ARRAY['predev_budget', 'budget_id', '', '', 'parent', 'line_items', 'predev_budgets', '', 'pursuit_id']),
    ('predev_schedule_items',    ARRAY['predev_budget', 'budget_id', '', '', 'parent', 'schedule', 'predev_budgets', '', 'pursuit_id']),
    ('key_dates',                ARRAY['key_date', 'id', 'custom_label', 'pursuit_id', 'self']),
    ('pursuit_checklist_tasks',  ARRAY['task', 'id', 'name', 'pursuit_id', 'self']),
    ('pursuit_checklist_items',  ARRAY['task', 'task_id', '', '', 'parent', 'checklist', 'pursuit_checklist_tasks', 'name', 'pursuit_id']),
    ('task_notes',               ARRAY['task', 'task_id', '', '', 'parent', 'notes', 'pursuit_checklist_tasks', 'name', 'pursuit_id']),
    -- Comps
    ('land_comps',               ARRAY['land_comp', 'id', 'name', '', 'self']),
    ('sale_comps',               ARRAY['sale_comp', 'id', 'name', '', 'self']),
    -- Admin settings
    ('pursuit_stages',           ARRAY['stage', 'id', 'name', '', 'self']),
    ('product_types',            ARRAY['product_type', 'id', 'name', '', 'self']),
    ('sub_product_types',        ARRAY['product_type', 'product_type_id', '', '', 'parent', 'sub_types', 'product_types', 'name', '']),
    ('key_date_types',           ARRAY['key_date_type', 'id', 'name', '', 'self']),
    ('data_model_templates',     ARRAY['template', 'id', 'name', '', 'self']),
    ('data_model_payroll_defaults', ARRAY['template', 'data_model_id', '', '', 'parent', 'payroll', 'data_model_templates', 'name', '']),
    ('tax_jurisdictions',        ARRAY['tax_rate', 'id', '', '', 'self']),
    ('checklist_templates',      ARRAY['checklist_template', 'id', 'name', '', 'self']),
    ('checklist_template_phases', ARRAY['checklist_template', 'template_id', '', '', 'parent', 'phases', 'checklist_templates', 'name', '']),
    ('default_predev_budget_line_items', ARRAY['budget_default', 'id', 'label', '', 'self']),
    ('default_predev_schedule_items',    ARRAY['budget_default', 'id', 'label', '', 'self'])
  ) AS v(tbl, args)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS log_activity ON public.%I', t.tbl);
    EXECUTE format(
      'CREATE TRIGGER log_activity AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_activity(%s)',
      t.tbl,
      (SELECT string_agg(quote_literal(a), ', ') FROM unnest(t.args) a)
    );
  END LOOP;
END;
$$;

-- ── Backfill from what the existing tables already record ───

INSERT INTO public.activity_log (actor_id, action, entity_type, entity_id, entity_label, pursuit_id, created_at, last_at)
SELECT created_by, 'created', 'pursuit', id, name, id, created_at, created_at FROM public.pursuits
  WHERE created_by IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = created_by)
UNION ALL
SELECT created_by, 'created', 'one_pager', id, name, pursuit_id, created_at, created_at FROM public.one_pagers
  WHERE created_by IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = created_by)
UNION ALL
SELECT created_by, 'created', 'predev_budget', id, 'Pre-dev budget', pursuit_id, created_at, created_at FROM public.predev_budgets
  WHERE created_by IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = created_by)
UNION ALL
SELECT created_by, 'created', 'land_comp', id, name, NULL, created_at, created_at FROM public.land_comps
  WHERE created_by IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = created_by)
UNION ALL
SELECT created_by, 'created', 'sale_comp', id, name, NULL, created_at, created_at FROM public.sale_comps
  WHERE created_by IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = created_by)
UNION ALL
SELECT created_by, 'created', 'one_pager', one_pager_id, label, NULL, created_at, created_at FROM public.one_pager_versions
  WHERE created_by IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = created_by)
UNION ALL
SELECT h.changed_by, 'updated', 'pursuit', h.pursuit_id, p.name, h.pursuit_id, h.changed_at, h.changed_at
  FROM public.pursuit_stage_history h JOIN public.pursuits p ON p.id = h.pursuit_id
  WHERE h.changed_by IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = h.changed_by)
UNION ALL
-- Rent comps were added in batches: one entry per person, pursuit and hour
SELECT rc.added_by, 'updated', 'pursuit', rc.pursuit_id, max(p.name), rc.pursuit_id, min(rc.added_at), max(rc.added_at)
  FROM public.pursuit_rent_comps rc JOIN public.pursuits p ON p.id = rc.pursuit_id
  WHERE rc.added_by IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = rc.added_by)
  GROUP BY rc.added_by, rc.pursuit_id, date_trunc('hour', rc.added_at);

-- Stage-change rows say which field changed; rent comp batches too
UPDATE public.activity_log a SET fields = ARRAY['stage_id']
  WHERE a.action = 'updated' AND a.entity_type = 'pursuit' AND a.fields = '{}'
    AND EXISTS (SELECT 1 FROM public.pursuit_stage_history h WHERE h.pursuit_id = a.entity_id AND h.changed_at = a.created_at);
UPDATE public.activity_log SET fields = ARRAY['rent_comps']
  WHERE action = 'updated' AND entity_type = 'pursuit' AND fields = '{}';

-- Saved versions are edits to an existing one-pager, not new ones
UPDATE public.activity_log a SET action = 'updated', fields = ARRAY['saved_version'], entity_label = o.name, pursuit_id = o.pursuit_id
  FROM public.one_pagers o, public.one_pager_versions v
  WHERE a.entity_type = 'one_pager' AND a.action = 'created' AND a.entity_id = v.one_pager_id
    AND a.created_at = v.created_at AND a.actor_id = v.created_by AND o.id = v.one_pager_id;

INSERT INTO public.user_active_days (user_id, day)
SELECT DISTINCT actor_id, (last_at AT TIME ZONE 'America/Chicago')::date FROM public.activity_log
ON CONFLICT DO NOTHING;
