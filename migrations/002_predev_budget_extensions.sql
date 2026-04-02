-- ============================================================
-- Migration: Pre-Dev Budget schema extensions
-- Target Database: pursuits (primary Supabase)
-- 
-- Adds:
--   1. budget_snapshot + snapshot_taken_at on predev_budgets
--   2. predev_budget_amendments table (audit trail)
--   3. yardi_cost_groups on predev_budget_line_items
--   4. pursuit_funding_partners table
--   5. pursuit_funding_splits table (per-month overrides)
-- ============================================================

-- 1. Budget snapshot columns
ALTER TABLE predev_budgets
  ADD COLUMN IF NOT EXISTS budget_snapshot jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS snapshot_taken_at timestamptz DEFAULT NULL;

-- 2. Budget amendment audit trail
CREATE TABLE IF NOT EXISTS predev_budget_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES predev_budgets(id) ON DELETE CASCADE,
  revision_number int NOT NULL DEFAULT 1,
  previous_snapshot jsonb NOT NULL,
  new_snapshot jsonb NOT NULL,
  reason text,
  amended_by uuid,
  amended_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budget_amendments_budget 
  ON predev_budget_amendments(budget_id);

-- 3. Yardi cost group mapping on line items
-- Stores 2-digit group prefixes (e.g., ["50", "51"])
-- that this budget line item should aggregate actuals from
ALTER TABLE predev_budget_line_items
  ADD COLUMN IF NOT EXISTS yardi_cost_groups text[] DEFAULT '{}';

-- 4. Funding partners per pursuit
CREATE TABLE IF NOT EXISTS pursuit_funding_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pursuit_id uuid NOT NULL REFERENCES pursuits(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_slrh boolean NOT NULL DEFAULT false,
  default_split_pct numeric(5,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funding_partners_pursuit 
  ON pursuit_funding_partners(pursuit_id);

-- 5. Per-month funding split overrides
-- Only rows that differ from the default need to be stored
CREATE TABLE IF NOT EXISTS pursuit_funding_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES predev_budgets(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES pursuit_funding_partners(id) ON DELETE CASCADE,
  month_key text NOT NULL,
  split_pct numeric(5,2) NOT NULL,
  UNIQUE(budget_id, partner_id, month_key)
);

-- Enable RLS on new tables (matching existing patterns)
ALTER TABLE predev_budget_amendments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pursuit_funding_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE pursuit_funding_splits ENABLE ROW LEVEL SECURITY;

-- RLS policies: authenticated users can read/write (matching existing patterns)
CREATE POLICY "Authenticated users can manage budget amendments"
  ON predev_budget_amendments FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage funding partners"
  ON pursuit_funding_partners FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage funding splits"
  ON pursuit_funding_splits FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
