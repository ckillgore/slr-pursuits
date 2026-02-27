-- ============================================================
-- Pre-Development Budgets
-- ============================================================

-- Header table: one per pursuit (created on demand)
CREATE TABLE predev_budgets (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pursuit_id      uuid NOT NULL REFERENCES pursuits(id) ON DELETE CASCADE,
  start_date      date NOT NULL,
  duration_months integer NOT NULL DEFAULT 12,
  notes           jsonb,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pursuit_id)
);

-- Line items: one row per budget category
CREATE TABLE predev_budget_line_items (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_id       uuid NOT NULL REFERENCES predev_budgets(id) ON DELETE CASCADE,
  category        text NOT NULL,
  label           text NOT NULL,
  sort_order      integer NOT NULL DEFAULT 0,
  is_custom       boolean NOT NULL DEFAULT false,
  monthly_values  jsonb NOT NULL DEFAULT '{}'::jsonb
  -- shape: { "2026-03": { "projected": 15000, "actual": null }, ... }
);

-- Indexes
CREATE INDEX idx_predev_budgets_pursuit ON predev_budgets(pursuit_id);
CREATE INDEX idx_predev_line_items_budget ON predev_budget_line_items(budget_id);

-- Auto-update updated_at
CREATE TRIGGER update_predev_budgets_updated_at
  BEFORE UPDATE ON predev_budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE predev_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE predev_budget_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON predev_budgets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON predev_budget_line_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
