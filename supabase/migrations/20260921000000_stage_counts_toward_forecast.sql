-- ============================================================
-- Pursuit stages: flag which stages roll up into spend forecasts
-- ============================================================
-- `is_active` already means "offer this stage in the stage picker", so it
-- cannot double as "this pursuit is still in the pipeline". This adds a
-- dedicated flag so the Pre-Dev spend forecast can drop pursuits that have
-- left the pipeline (Passed / Dead / Inactive) or closed out of pre-dev
-- (Closed) without hiding those stages from the rest of the app.

ALTER TABLE pursuit_stages
  ADD COLUMN IF NOT EXISTS counts_toward_forecast boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN pursuit_stages.counts_toward_forecast IS
  'When false, pursuits in this stage are excluded from pre-dev spend forecast rollups. Distinct from is_active, which controls whether the stage is selectable.';

UPDATE pursuit_stages
   SET counts_toward_forecast = false
 WHERE name IN ('Closed', 'Passed', 'Dead', 'Inactive');
