-- ============================================================
-- SLR One-Pager — Initial Schema Migration
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Lookup / Reference Tables
-- ============================================================

-- Pursuit Stages
CREATE TABLE pursuit_stages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#94A3B8',
  is_active boolean NOT NULL DEFAULT true
);

-- Product Types
CREATE TABLE product_types (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  density_low numeric(6,1) NOT NULL DEFAULT 0,
  density_high numeric(6,1) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

-- Sub-Product Types
CREATE TABLE sub_product_types (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_type_id uuid NOT NULL REFERENCES product_types(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

-- ============================================================
-- Core Tables
-- ============================================================

-- User Profiles (linked to Supabase Auth)
CREATE TABLE user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true
);

-- Pursuits
CREATE TABLE pursuits (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  county text NOT NULL DEFAULT '',
  zip text NOT NULL DEFAULT '',
  latitude numeric(10,7),
  longitude numeric(10,7),
  site_area_sf numeric(12,2) NOT NULL DEFAULT 0,
  stage_id uuid NOT NULL REFERENCES pursuit_stages(id),
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  exec_summary jsonb,
  arch_notes jsonb,
  region text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_archived boolean NOT NULL DEFAULT false
);

-- One-Pagers
CREATE TABLE one_pagers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pursuit_id uuid NOT NULL REFERENCES pursuits(id) ON DELETE CASCADE,
  name text NOT NULL,
  product_type_id uuid NOT NULL REFERENCES product_types(id),
  sub_product_type_id uuid REFERENCES sub_product_types(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_archived boolean NOT NULL DEFAULT false,
  -- Site & Density
  total_units integer NOT NULL DEFAULT 0,
  efficiency_ratio numeric(5,4) NOT NULL DEFAULT 0.8500,
  -- Revenue
  other_income_per_unit_month numeric(10,2) NOT NULL DEFAULT 0,
  vacancy_rate numeric(5,4) NOT NULL DEFAULT 0.0700,
  -- Budget
  hard_cost_per_nrsf numeric(10,2) NOT NULL DEFAULT 0,
  land_cost numeric(14,2) NOT NULL DEFAULT 0,
  soft_cost_pct numeric(5,4) NOT NULL DEFAULT 0.3000,
  use_detailed_soft_costs boolean NOT NULL DEFAULT false,
  -- OpEx ($/unit/year)
  opex_utilities numeric(10,2) NOT NULL DEFAULT 0,
  opex_repairs_maintenance numeric(10,2) NOT NULL DEFAULT 0,
  opex_contract_services numeric(10,2) NOT NULL DEFAULT 0,
  opex_marketing numeric(10,2) NOT NULL DEFAULT 0,
  opex_general_admin numeric(10,2) NOT NULL DEFAULT 0,
  opex_turnover numeric(10,2) NOT NULL DEFAULT 0,
  opex_misc numeric(10,2) NOT NULL DEFAULT 0,
  opex_insurance numeric(10,2) NOT NULL DEFAULT 0,
  mgmt_fee_pct numeric(5,4) NOT NULL DEFAULT 0.0300,
  -- Payroll
  payroll_burden_pct numeric(5,4) NOT NULL DEFAULT 0.3000,
  -- Property Tax
  tax_mil_rate numeric(10,6) NOT NULL DEFAULT 0,
  tax_assessed_pct_hard numeric(5,4) NOT NULL DEFAULT 1.0000,
  tax_assessed_pct_land numeric(5,4) NOT NULL DEFAULT 1.0000,
  tax_assessed_pct_soft numeric(5,4) NOT NULL DEFAULT 1.0000,
  -- Sensitivity
  sensitivity_rent_steps numeric(6,2)[] DEFAULT ARRAY[-0.15, -0.10, -0.05, 0, 0.05, 0.10, 0.15],
  sensitivity_hard_cost_steps numeric(10,2)[] DEFAULT ARRAY[-15, -10, -5, 0, 5, 10, 15],
  sensitivity_land_cost_steps numeric(14,2)[] DEFAULT ARRAY[-2000000, -1000000, -500000, 0, 500000, 1000000, 2000000],
  -- Stored Calculated Values
  calc_total_nrsf numeric,
  calc_total_gbsf numeric,
  calc_gpr numeric,
  calc_net_revenue numeric,
  calc_total_budget numeric,
  calc_hard_cost numeric,
  calc_soft_cost numeric,
  calc_total_opex numeric,
  calc_noi numeric,
  calc_yoc numeric,
  calc_cost_per_unit numeric,
  calc_noi_per_unit numeric
);

-- One-Pager Unit Mix
CREATE TABLE one_pager_unit_mix (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  one_pager_id uuid NOT NULL REFERENCES one_pagers(id) ON DELETE CASCADE,
  unit_type text NOT NULL DEFAULT 'other',
  unit_type_label text NOT NULL DEFAULT 'Other',
  unit_count integer NOT NULL DEFAULT 0,
  avg_unit_sf numeric(8,2) NOT NULL DEFAULT 0,
  rent_input_mode text NOT NULL DEFAULT 'per_sf',
  rent_per_sf numeric(8,4) NOT NULL DEFAULT 0,
  rent_whole_dollar numeric(10,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

-- One-Pager Payroll
CREATE TABLE one_pager_payroll (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  one_pager_id uuid NOT NULL REFERENCES one_pagers(id) ON DELETE CASCADE,
  line_type text NOT NULL DEFAULT 'employee',
  role_name text NOT NULL DEFAULT '',
  headcount numeric(4,1) NOT NULL DEFAULT 0,
  base_compensation numeric(10,2) NOT NULL DEFAULT 0,
  bonus_pct numeric(5,4) NOT NULL DEFAULT 0,
  fixed_amount numeric(10,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

-- One-Pager Soft Cost Detail
CREATE TABLE one_pager_soft_cost_detail (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  one_pager_id uuid NOT NULL REFERENCES one_pagers(id) ON DELETE CASCADE,
  line_item_name text NOT NULL DEFAULT '',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

-- Data Model Templates
CREATE TABLE data_model_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  product_type_id uuid NOT NULL REFERENCES product_types(id),
  region text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Default assumption values
  default_efficiency_ratio numeric(5,4) NOT NULL DEFAULT 0.8500,
  default_other_income_per_unit_month numeric(10,2) NOT NULL DEFAULT 0,
  default_vacancy_rate numeric(5,4) NOT NULL DEFAULT 0.0700,
  default_hard_cost_per_nrsf numeric(10,2) NOT NULL DEFAULT 0,
  default_soft_cost_pct numeric(5,4) NOT NULL DEFAULT 0.3000,
  default_opex_utilities numeric(10,2) NOT NULL DEFAULT 0,
  default_opex_repairs_maintenance numeric(10,2) NOT NULL DEFAULT 0,
  default_opex_contract_services numeric(10,2) NOT NULL DEFAULT 0,
  default_opex_marketing numeric(10,2) NOT NULL DEFAULT 0,
  default_opex_general_admin numeric(10,2) NOT NULL DEFAULT 0,
  default_opex_turnover numeric(10,2) NOT NULL DEFAULT 0,
  default_opex_misc numeric(10,2) NOT NULL DEFAULT 0,
  default_opex_insurance numeric(10,2) NOT NULL DEFAULT 0,
  default_mgmt_fee_pct numeric(5,4) NOT NULL DEFAULT 0.0300,
  default_payroll_burden_pct numeric(5,4) NOT NULL DEFAULT 0.3000,
  default_tax_mil_rate numeric(10,6) NOT NULL DEFAULT 0,
  default_tax_assessed_pct_hard numeric(5,4) NOT NULL DEFAULT 1.0000,
  default_tax_assessed_pct_land numeric(5,4) NOT NULL DEFAULT 1.0000,
  default_tax_assessed_pct_soft numeric(5,4) NOT NULL DEFAULT 1.0000
);

-- Data Model Payroll Defaults
CREATE TABLE data_model_payroll_defaults (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  data_model_id uuid NOT NULL REFERENCES data_model_templates(id) ON DELETE CASCADE,
  line_type text NOT NULL DEFAULT 'employee',
  role_name text NOT NULL DEFAULT '',
  headcount numeric(4,1) NOT NULL DEFAULT 0,
  base_compensation numeric(10,2) NOT NULL DEFAULT 0,
  bonus_pct numeric(5,4) NOT NULL DEFAULT 0,
  fixed_amount numeric(10,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

-- Pursuit Stage History
CREATE TABLE pursuit_stage_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pursuit_id uuid NOT NULL REFERENCES pursuits(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES pursuit_stages(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES auth.users(id)
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_pursuits_stage ON pursuits(stage_id);
CREATE INDEX idx_pursuits_archived ON pursuits(is_archived);
CREATE INDEX idx_one_pagers_pursuit ON one_pagers(pursuit_id);
CREATE INDEX idx_one_pagers_product_type ON one_pagers(product_type_id);
CREATE INDEX idx_unit_mix_one_pager ON one_pager_unit_mix(one_pager_id);
CREATE INDEX idx_payroll_one_pager ON one_pager_payroll(one_pager_id);
CREATE INDEX idx_soft_cost_one_pager ON one_pager_soft_cost_detail(one_pager_id);
CREATE INDEX idx_stage_history_pursuit ON pursuit_stage_history(pursuit_id);

-- ============================================================
-- Auto-update updated_at trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_pursuits_updated_at
  BEFORE UPDATE ON pursuits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_one_pagers_updated_at
  BEFORE UPDATE ON one_pagers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_data_model_templates_updated_at
  BEFORE UPDATE ON data_model_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Text sanitization trigger (TRIM whitespace)
-- ============================================================

CREATE OR REPLACE FUNCTION trim_text_fields()
RETURNS TRIGGER AS $$
DECLARE
  col_name text;
  col_value text;
BEGIN
  FOR col_name IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name = TG_TABLE_NAME
      AND table_schema = TG_TABLE_SCHEMA
      AND data_type = 'text'
  LOOP
    EXECUTE format('SELECT ($1).%I', col_name) INTO col_value USING NEW;
    IF col_value IS NOT NULL THEN
      NEW := NEW #= hstore(col_name, TRIM(col_value));
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Note: this trigger requires the hstore extension.
-- If hstore is not available, you can manually TRIM specific columns instead.
-- CREATE EXTENSION IF NOT EXISTS hstore;
-- CREATE TRIGGER trim_pursuits BEFORE INSERT OR UPDATE ON pursuits FOR EACH ROW EXECUTE FUNCTION trim_text_fields();
-- CREATE TRIGGER trim_one_pagers BEFORE INSERT OR UPDATE ON one_pagers FOR EACH ROW EXECUTE FUNCTION trim_text_fields();
-- ... etc for other tables

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE pursuit_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_product_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pursuits ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_pagers ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_pager_unit_mix ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_pager_payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_pager_soft_cost_detail ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_model_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_model_payroll_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE pursuit_stage_history ENABLE ROW LEVEL SECURITY;

-- Single-team app: authenticated users have full access
CREATE POLICY "Authenticated full access" ON pursuit_stages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON product_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON sub_product_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON user_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON pursuits FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON one_pagers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON one_pager_unit_mix FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON one_pager_payroll FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON one_pager_soft_cost_detail FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON data_model_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON data_model_payroll_defaults FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON pursuit_stage_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Seed Data
-- ============================================================

-- Pursuit Stages
INSERT INTO pursuit_stages (name, sort_order, color) VALUES
  ('Screening', 1, '#94A3B8'),
  ('Initial Analysis', 2, '#3B82F6'),
  ('LOI', 3, '#8B5CF6'),
  ('Under Contract', 4, '#F59E0B'),
  ('Due Diligence', 5, '#F97316'),
  ('Closed', 6, '#10B981'),
  ('Passed', 7, '#EF4444'),
  ('Dead', 8, '#6B7280');

-- Product Types
INSERT INTO product_types (name, density_low, density_high, sort_order) VALUES
  ('Townhomes', 12, 20, 1),
  ('Garden', 20, 30, 2),
  ('Hybrid', 25, 40, 3),
  ('Wrap', 35, 55, 4),
  ('Mid Rise', 50, 80, 5),
  ('High Rise', 80, 150, 6),
  ('Other', 10, 150, 7);

-- Sub-Product Types (for Wrap and High Rise)
INSERT INTO sub_product_types (product_type_id, name, sort_order)
SELECT id, sub.name, sub.sort_order
FROM product_types pt,
LATERAL (
  VALUES
    ('3-Story Wrap', 1),
    ('4-Story Wrap', 2),
    ('5-Story Wrap', 3),
    ('5 Over 1 Wrap', 4),
    ('5 Over 2 Wrap', 5)
) AS sub(name, sort_order)
WHERE pt.name = 'Wrap';

INSERT INTO sub_product_types (product_type_id, name, sort_order)
SELECT id, sub.name, sub.sort_order
FROM product_types pt,
LATERAL (
  VALUES
    ('High Rise with Adjacent Garage', 1),
    ('High Rise Podium', 2)
) AS sub(name, sort_order)
WHERE pt.name = 'High Rise';
