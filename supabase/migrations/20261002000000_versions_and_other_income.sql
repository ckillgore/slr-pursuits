-- ============================================================
-- One-pager versions + itemized other income
-- ============================================================

-- ---------- 1. Itemized other income ----------
-- Lines like "Parking: 300 spaces x $75/mo". When use_detailed_other_income is
-- on, the editor sums the lines and keeps one_pagers.other_income_per_unit_month
-- equal to the per-unit equivalent, so every calculation, report and export
-- that reads that field stays correct.

CREATE TABLE IF NOT EXISTS public.one_pager_other_income (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  one_pager_id uuid NOT NULL REFERENCES public.one_pagers(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  unit_count numeric NOT NULL DEFAULT 0,
  amount_per_month numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.one_pager_other_income.unit_count IS 'Units, spaces or residents paying this line (e.g. parking spaces).';
CREATE INDEX IF NOT EXISTS idx_one_pager_other_income_one_pager ON public.one_pager_other_income (one_pager_id);

ALTER TABLE public.one_pager_other_income ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access" ON public.one_pager_other_income;
CREATE POLICY "Authenticated full access" ON public.one_pager_other_income
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.one_pagers
  ADD COLUMN IF NOT EXISTS use_detailed_other_income boolean NOT NULL DEFAULT false;

-- Live collaboration: publish changes like the other one-pager child tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'one_pager_other_income') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.one_pager_other_income;
  END IF;
END $$;

-- ---------- 2. Versions ----------
-- A version is a full snapshot of a one-pager and its child rows. The team was
-- keeping history as sibling one-pagers ("Highrise 1 / v2 / v3"); versions
-- keep it inside the scenario.

CREATE TABLE IF NOT EXISTS public.one_pager_versions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  one_pager_id uuid NOT NULL REFERENCES public.one_pagers(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  snapshot jsonb NOT NULL,
  -- Headline numbers, so the list doesn't need to read the snapshot
  total_units integer,
  calc_total_budget numeric,
  calc_noi numeric,
  calc_yoc numeric,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_one_pager_versions_one_pager ON public.one_pager_versions (one_pager_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_one_pager_versions_created_by ON public.one_pager_versions (created_by);

ALTER TABLE public.one_pager_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read" ON public.one_pager_versions;
CREATE POLICY "Authenticated read" ON public.one_pager_versions
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated insert" ON public.one_pager_versions;
CREATE POLICY "Authenticated insert" ON public.one_pager_versions
  FOR INSERT TO authenticated WITH CHECK (true);
-- Versions are history: no edits; delete your own, admins delete any
DROP POLICY IF EXISTS "Delete own or admin" ON public.one_pager_versions;
CREATE POLICY "Delete own or admin" ON public.one_pager_versions
  FOR DELETE TO authenticated
  USING (created_by = (select auth.uid()) OR (select public.get_user_role()) IN ('owner', 'admin'));

-- Snapshot a one-pager. SECURITY INVOKER: the caller's RLS applies.
CREATE OR REPLACE FUNCTION public.save_one_pager_version(p_one_pager_id uuid, p_label text)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  op one_pagers%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO op FROM one_pagers WHERE id = p_one_pager_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'One-pager % not found', p_one_pager_id;
  END IF;

  INSERT INTO one_pager_versions (one_pager_id, label, snapshot, total_units, calc_total_budget, calc_noi, calc_yoc)
  VALUES (
    p_one_pager_id,
    coalesce(nullif(btrim(p_label), ''), to_char(now() AT TIME ZONE 'America/Chicago', 'Mon DD, YYYY HH12:MI AM')),
    jsonb_build_object(
      'one_pager',      to_jsonb(op),
      'unit_mix',       coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.sort_order) FROM one_pager_unit_mix r WHERE r.one_pager_id = p_one_pager_id), '[]'),
      'payroll',        coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.sort_order) FROM one_pager_payroll r WHERE r.one_pager_id = p_one_pager_id), '[]'),
      'soft_cost_detail', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.sort_order) FROM one_pager_soft_cost_detail r WHERE r.one_pager_id = p_one_pager_id), '[]'),
      'unit_premiums',  coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.sort_order) FROM unit_premiums r WHERE r.one_pager_id = p_one_pager_id), '[]'),
      'other_income',   coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.sort_order) FROM one_pager_other_income r WHERE r.one_pager_id = p_one_pager_id), '[]')
    ),
    op.total_units, op.calc_total_budget, op.calc_noi, op.calc_yoc
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Replace a one-pager's rows in one child table with snapshot rows. Only the
-- columns present in the snapshot are written, so a column added after the
-- snapshot was taken gets its default instead of NULL.
CREATE OR REPLACE FUNCTION public._restore_one_pager_rows(p_table text, p_one_pager_id uuid, p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cols text;
BEGIN
  IF p_table NOT IN ('one_pager_unit_mix', 'one_pager_payroll', 'one_pager_soft_cost_detail', 'unit_premiums', 'one_pager_other_income') THEN
    RAISE EXCEPTION 'Not a one-pager child table: %', p_table;
  END IF;
  EXECUTE format('DELETE FROM %I WHERE one_pager_id = $1', p_table) USING p_one_pager_id;
  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RETURN;
  END IF;
  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO cols
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = p_table
     AND p_rows->0 ? c.column_name;
  EXECUTE format('INSERT INTO %I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::%I, $1)', p_table, cols, cols, p_table)
    USING p_rows;
END;
$$;

-- Restore a version in one transaction. The current state is saved as a
-- version first, so a restore can always be undone. Name, notes, archive
-- state and ownership stay as they are; assumptions and child rows come back.
CREATE OR REPLACE FUNCTION public.restore_one_pager_version(p_version_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v one_pager_versions%ROWTYPE;
  cols text;
  backup_id uuid;
BEGIN
  SELECT * INTO v FROM one_pager_versions WHERE id = p_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version % not found', p_version_id;
  END IF;

  backup_id := public.save_one_pager_version(v.one_pager_id, 'Before restoring "' || v.label || '"');

  -- Every column the snapshot has, except identity / ownership / notes
  SELECT string_agg(format('%1$I = s.%1$I', c.column_name), ', ')
    INTO cols
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'one_pagers'
     AND c.column_name NOT IN ('id', 'short_id', 'pursuit_id', 'name', 'created_by', 'created_at', 'updated_at', 'is_archived', 'field_notes')
     AND v.snapshot->'one_pager' ? c.column_name;

  EXECUTE format(
    'UPDATE one_pagers o SET %s FROM jsonb_populate_record(NULL::one_pagers, $1) s WHERE o.id = $2',
    cols
  ) USING v.snapshot->'one_pager', v.one_pager_id;

  PERFORM public._restore_one_pager_rows('one_pager_unit_mix', v.one_pager_id, v.snapshot->'unit_mix');
  PERFORM public._restore_one_pager_rows('one_pager_payroll', v.one_pager_id, v.snapshot->'payroll');
  PERFORM public._restore_one_pager_rows('one_pager_soft_cost_detail', v.one_pager_id, v.snapshot->'soft_cost_detail');
  PERFORM public._restore_one_pager_rows('unit_premiums', v.one_pager_id, v.snapshot->'unit_premiums');
  PERFORM public._restore_one_pager_rows('one_pager_other_income', v.one_pager_id, coalesce(v.snapshot->'other_income', '[]'));

  RETURN backup_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_one_pager_version(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_one_pager_version(uuid) FROM PUBLIC, anon;
-- Runs with the caller's rights (RLS applies) and only on the child tables above
REVOKE EXECUTE ON FUNCTION public._restore_one_pager_rows(text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._restore_one_pager_rows(text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_one_pager_version(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_one_pager_version(uuid) TO authenticated;
