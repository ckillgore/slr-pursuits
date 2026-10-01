-- ============================================================
-- Data model templates: SLR standards from one-pagers to date
-- ============================================================
-- Values are medians of active one-pagers (excluding 0-unit placeholders) as
-- of 2026-10-01, rounded. OpEx is $/unit/year. Mid Rise is split at an
-- average unit of 1,500 SF: the boutique/luxury deals (The Manor, Manor
-- Phase II, 483 Meeting, Marina, ...) carry very different costs.
--
-- Property tax rate is left at 0 on purpose: it varies by jurisdiction
-- (Dallas 2.235% vs Charlotte ~0.77%) and is set on each one-pager.
-- Assessed % follows team practice: 90% hard, 100% land, 0% soft.
--
-- Also retires the all-zero "Test Template" so it stops being offered.

UPDATE data_model_templates SET is_active = false WHERE name = 'Test Template';

WITH t (name, product, eff, oi, vac, hc, sc, util, rm, cs, mkt, ga, turn, misc, ins, capex, mgmt, burden) AS (
  VALUES
    ('Wrap — SLR Standard',                'Wrap',      0.85, 200, 0.05, 310, 0.23,  400, 400,  350,  450, 400, 250,   0, 1000, 200, 0.0225, 0.28),
    ('High Rise — SLR Standard',           'High Rise', 0.85, 250, 0.05, 415, 0.20,  600, 500,  700,  550, 550, 350,   0, 1125, 250, 0.0225, 0.28),
    ('Mid Rise — SLR Standard',            'Mid Rise',  0.85, 200, 0.05, 340, 0.21,  700, 375,  750,  500, 500, 200,   0, 1500, 175, 0.0225, 0.30),
    ('Mid Rise — Boutique / Luxury',       'Mid Rise',  0.85, 350, 0.035, 500, 0.30, 850, 850, 1000, 1600, 850, 750,   0, 2500, 250, 0.0200, 0.30),
    ('Garden — SLR Standard',              'Garden',    0.85, 150, 0.05, 245, 0.225, 300, 500,  400,  400, 300, 250, 100, 1000, 150, 0.0225, 0.28),
    ('Townhomes — SLR Standard',           'Townhomes', 0.85, 200, 0.07, 215, 0.20,  400, 500,  475,  400, 500, 200,   0, 1450, 150, 0.0225, 0.28)
)
INSERT INTO data_model_templates (
  name, product_type_id, region, is_active,
  default_efficiency_ratio, default_other_income_per_unit_month, default_vacancy_rate,
  default_hard_cost_per_nrsf, default_soft_cost_pct,
  default_opex_utilities, default_opex_repairs_maintenance, default_opex_contract_services,
  default_opex_marketing, default_opex_general_admin, default_opex_turnover, default_opex_misc,
  default_opex_insurance, default_opex_capex_reserves,
  default_mgmt_fee_pct, default_payroll_burden_pct,
  default_tax_mil_rate, default_tax_assessed_pct_hard, default_tax_assessed_pct_land, default_tax_assessed_pct_soft
)
SELECT t.name, pt.id, NULL, true,
       t.eff, t.oi, t.vac, t.hc, t.sc,
       t.util, t.rm, t.cs, t.mkt, t.ga, t.turn, t.misc, t.ins, t.capex,
       t.mgmt, t.burden,
       0, 0.90, 1.00, 0
  FROM t
  JOIN product_types pt ON pt.name = t.product
 WHERE NOT EXISTS (SELECT 1 FROM data_model_templates d WHERE d.name = t.name);

-- Typical staffing: roles present on most one-pagers of each type, with
-- median comp. Contract lines carry a fixed annual amount.
WITH p (template, sort_order, line_type, role_name, headcount, comp, bonus, fixed) AS (
  VALUES
    ('Wrap — SLR Standard', 0, 'employee', 'Manager',                1,  90000, 0.15, 0),
    ('Wrap — SLR Standard', 1, 'employee', 'Assistant Manager',      1,  60000, 0.15, 0),
    ('Wrap — SLR Standard', 2, 'employee', 'Leasing',                2,  40000, 0.15, 0),
    ('Wrap — SLR Standard', 3, 'employee', 'Lead Maintenance',       1,  70000, 0.15, 0),
    ('Wrap — SLR Standard', 4, 'employee', 'Assistant Maintenance',  1,  49000, 0.15, 0),
    ('Wrap — SLR Standard', 5, 'employee', 'Porter',                 1,  33000, 0.15, 0),
    ('Wrap — SLR Standard', 6, 'employee', 'Housekeeper',            1,  35000, 0.15, 0),

    ('High Rise — SLR Standard', 0, 'employee', 'Manager',               1, 100000, 0.15, 0),
    ('High Rise — SLR Standard', 1, 'employee', 'Assistant Manager',     1,  62000, 0.15, 0),
    ('High Rise — SLR Standard', 2, 'employee', 'Leasing',               2,  45000, 0.15, 0),
    ('High Rise — SLR Standard', 3, 'employee', 'Lead Maintenance',      1,  80000, 0.15, 0),
    ('High Rise — SLR Standard', 4, 'employee', 'Assistant Maintenance', 1,  54000, 0.15, 0),
    ('High Rise — SLR Standard', 5, 'employee', 'Porter',                1,  40000, 0.15, 0),
    ('High Rise — SLR Standard', 6, 'employee', 'Housekeeper',           1,  37000, 0.15, 0),
    ('High Rise — SLR Standard', 7, 'contract', 'Concierge',             0,      0, 0,    180000),

    ('Mid Rise — SLR Standard', 0, 'employee', 'Manager',          1, 100000, 0.15,  0),
    ('Mid Rise — SLR Standard', 1, 'employee', 'Leasing',          1,  47500, 0.20,  0),
    ('Mid Rise — SLR Standard', 2, 'employee', 'Lead Maintenance', 1,  82500, 0.125, 0),
    ('Mid Rise — SLR Standard', 3, 'employee', 'Porter',           1,  38500, 0,     0),
    ('Mid Rise — SLR Standard', 4, 'employee', 'Housekeeper',      1,  38500, 0,     0),

    ('Mid Rise — Boutique / Luxury', 0, 'employee', 'Manager',          1, 100000, 0.15,  0),
    ('Mid Rise — Boutique / Luxury', 1, 'employee', 'Leasing',          1,  47500, 0.20,  0),
    ('Mid Rise — Boutique / Luxury', 2, 'employee', 'Lead Maintenance', 1,  82500, 0.125, 0),
    ('Mid Rise — Boutique / Luxury', 3, 'employee', 'Porter',           1,  38500, 0,     0),
    ('Mid Rise — Boutique / Luxury', 4, 'employee', 'Housekeeper',      1,  38500, 0,     0),

    ('Garden — SLR Standard', 0, 'employee', 'Manager',               1, 90000, 0.15, 0),
    ('Garden — SLR Standard', 1, 'employee', 'Assistant Manager',     1, 62500, 0.15, 0),
    ('Garden — SLR Standard', 2, 'employee', 'Leasing',               2, 40000, 0.15, 0),
    ('Garden — SLR Standard', 3, 'employee', 'Lead Maintenance',      1, 65000, 0.15, 0),
    ('Garden — SLR Standard', 4, 'employee', 'Assistant Maintenance', 1, 50000, 0.15, 0),
    ('Garden — SLR Standard', 5, 'employee', 'Porter',                1, 35000, 0.15, 0),

    ('Townhomes — SLR Standard', 0, 'employee', 'Manager',          1, 80000, 0.15, 0),
    ('Townhomes — SLR Standard', 1, 'employee', 'Leasing',          1, 44000, 0.15, 0),
    ('Townhomes — SLR Standard', 2, 'employee', 'Lead Maintenance', 1, 75000, 0.15, 0),
    ('Townhomes — SLR Standard', 3, 'employee', 'Porter',           1, 38000, 0.15, 0),
    ('Townhomes — SLR Standard', 4, 'employee', 'Housekeeper',      1, 38000, 0.15, 0)
)
INSERT INTO data_model_payroll_defaults (data_model_id, sort_order, line_type, role_name, headcount, base_compensation, bonus_pct, fixed_amount)
SELECT d.id, p.sort_order, p.line_type, p.role_name, p.headcount, p.comp, p.bonus, p.fixed
  FROM p
  JOIN data_model_templates d ON d.name = p.template
 WHERE NOT EXISTS (SELECT 1 FROM data_model_payroll_defaults x WHERE x.data_model_id = d.id);

-- Column defaults for any template created without explicit values
ALTER TABLE data_model_templates
  ALTER COLUMN default_vacancy_rate SET DEFAULT 0.05,
  ALTER COLUMN default_soft_cost_pct SET DEFAULT 0.23,
  ALTER COLUMN default_mgmt_fee_pct SET DEFAULT 0.0225,
  ALTER COLUMN default_payroll_burden_pct SET DEFAULT 0.28,
  ALTER COLUMN default_tax_assessed_pct_hard SET DEFAULT 0.90,
  ALTER COLUMN default_tax_assessed_pct_soft SET DEFAULT 0;
