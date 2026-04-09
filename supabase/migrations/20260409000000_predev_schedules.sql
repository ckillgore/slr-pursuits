-- ============================================================
-- Pre-Development Schedules
-- ============================================================

CREATE TABLE default_predev_schedule_items (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  section         text NOT NULL,
  label           text NOT NULL,
  duration_weeks  integer NOT NULL DEFAULT 4,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed Data (Matching the concept photo exactly)
INSERT INTO default_predev_schedule_items (section, label, duration_weeks, sort_order) VALUES
  ('Entitlements', 'SB840 Determination', 4, 10),
  ('Design', 'Masterplan Concept Design', 13, 20),
  ('Design', 'Kickoff Charrette', 1, 30),
  ('Design', 'Concept Design', 4, 40),
  ('Design', 'SD', 12, 50),
  ('Design', 'DD', 12, 60),
  ('Design', 'Permit Set', 9, 70),
  ('Design', 'GMP', 7, 80),
  ('Design', 'IFC', 4, 90),
  ('Pricing', 'Concept Pricing', 2, 100),
  ('Pricing', 'SD Pricing', 8, 110),
  ('Pricing', 'DD Pricing', 8, 120),
  ('Pricing', 'GMP Pricing', 8, 130),
  ('Permits & Platting', 'Preliminary Site Plan', 6, 140),
  ('Permits & Platting', 'Site Plan, Landscape Plans, Replat', 28, 150),
  ('Permits & Platting', 'Engineering Plans', 28, 160),
  ('Permits & Platting', 'Building Permit', 18, 170),
  ('Construction', 'Closing', 6, 180),
  ('Construction', 'Construction Start', 0, 190);

CREATE TABLE predev_schedule_items (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_id       uuid NOT NULL REFERENCES predev_budgets(id) ON DELETE CASCADE,
  section         text,
  label           text NOT NULL,
  start_date      date,
  duration_weeks  integer NOT NULL DEFAULT 4,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_predev_schedule_items_budget ON predev_schedule_items(budget_id);

CREATE TRIGGER update_predev_schedule_items_updated_at
  BEFORE UPDATE ON predev_schedule_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE default_predev_schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE predev_schedule_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON default_predev_schedule_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON predev_schedule_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
