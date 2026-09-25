-- ============================================================
-- One-pager live collaboration, 2026-09-25
--
-- 1. Realtime publication. src/hooks/useRealtimeOnePager.ts subscribes to
--    postgres_changes on the tables below, but as of this date the
--    supabase_realtime publication contains NO tables, so no change events
--    were ever delivered and other users' edits never appeared live.
--    Realtime still applies RLS: only signed-in users receive events.
--
-- 2. Atomic field-note edits. one_pagers.field_notes is one jsonb object;
--    saving the whole object from the client lets two users editing
--    different notes overwrite each other. set_one_pager_field_note merges
--    (or removes) a single key server-side in one UPDATE.
-- ============================================================

-- ---------- 1. Realtime ----------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'one_pagers',
    'one_pager_unit_mix',
    'one_pager_payroll',
    'one_pager_soft_cost_detail',
    'unit_premiums'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ---------- 2. Field notes ----------
-- p_value NULL (or JSON null) deletes the key. Returns the merged object so
-- the caller can update its cache without a refetch. SECURITY INVOKER: the
-- caller's one_pagers RLS applies.
CREATE OR REPLACE FUNCTION public.set_one_pager_field_note(
  p_one_pager_id uuid,
  p_key text,
  p_value jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.one_pagers
  SET field_notes = CASE
        WHEN p_value IS NULL OR p_value = 'null'::jsonb
          THEN coalesce(field_notes, '{}'::jsonb) - p_key
        ELSE coalesce(field_notes, '{}'::jsonb) || jsonb_build_object(p_key, p_value)
      END
  WHERE id = p_one_pager_id
  RETURNING field_notes;
$$;

REVOKE EXECUTE ON FUNCTION public.set_one_pager_field_note(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_one_pager_field_note(uuid, text, jsonb) TO authenticated, service_role;
