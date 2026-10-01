-- ============================================================
-- Pursuit stage history: record every stage change
-- ============================================================
-- pursuit_stage_history was read by Analytics (funnel, conversion) but nothing
-- ever wrote to it: the app only overwrites pursuits.stage_id and
-- stage_changed_at. A trigger records changes no matter which screen (or
-- script) makes them.
--
--   INSERT with a stage            -> history row for the starting stage
--   UPDATE that changes stage_id   -> history row for the new stage
--   UPDATE of stage_changed_at only (the "Stage Since" date editor)
--                                  -> move the current stage's latest row to
--                                     the corrected date

CREATE OR REPLACE FUNCTION public.record_pursuit_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO pursuit_stage_history (pursuit_id, stage_id, changed_at, changed_by)
    VALUES (NEW.id, NEW.stage_id, COALESCE(NEW.stage_changed_at, now()), auth.uid());
  ELSIF NEW.stage_changed_at IS DISTINCT FROM OLD.stage_changed_at
        AND NEW.stage_changed_at IS NOT NULL THEN
    UPDATE pursuit_stage_history
       SET changed_at = NEW.stage_changed_at
     WHERE id = (
       SELECT id FROM pursuit_stage_history
        WHERE pursuit_id = NEW.id AND stage_id = NEW.stage_id
        ORDER BY changed_at DESC
        LIMIT 1
     );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_pursuit_stage_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS record_pursuit_stage_change ON public.pursuits;
CREATE TRIGGER record_pursuit_stage_change
  AFTER INSERT OR UPDATE OF stage_id, stage_changed_at ON public.pursuits
  FOR EACH ROW EXECUTE FUNCTION public.record_pursuit_stage_change();

-- Backfill: one row per pursuit for the stage it is in now. Earlier stages
-- were never recorded and can't be recovered.
INSERT INTO pursuit_stage_history (pursuit_id, stage_id, changed_at, changed_by)
SELECT p.id, p.stage_id, COALESCE(p.stage_changed_at, p.created_at), NULL
  FROM pursuits p
 WHERE p.stage_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM pursuit_stage_history h WHERE h.pursuit_id = p.id);
