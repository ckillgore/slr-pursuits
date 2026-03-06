-- ============================================================
-- SLR Pursuits — Migration: Parking, Density Subtypes, Premiums
-- Run this in your Supabase SQL editor
-- ============================================================

-- 1. PARKING SPACES on one_pagers
ALTER TABLE one_pagers
ADD COLUMN IF NOT EXISTS parking_spaces integer NOT NULL DEFAULT 0;

-- 2. DENSITY OVERRIDES on sub_product_types
ALTER TABLE sub_product_types
ADD COLUMN IF NOT EXISTS density_low numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS density_high numeric DEFAULT NULL;

-- 3. UNIT PREMIUMS table
-- Premiums are add-ons to base rent (e.g. view premium, floor premium).
-- Each premium has a name, extra rent per unit per month, and applies
-- to specific unit mix rows or all rows.
CREATE TABLE IF NOT EXISTS unit_premiums (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    one_pager_id uuid NOT NULL REFERENCES one_pagers(id) ON DELETE CASCADE,
    name text NOT NULL DEFAULT 'New Premium',
    rent_premium_per_unit_month numeric NOT NULL DEFAULT 0,
    apply_to_all boolean NOT NULL DEFAULT true,
    -- When apply_to_all is false, this array holds the unit_mix_row IDs
    -- this premium applies to. When true, this is ignored.
    unit_mix_row_ids uuid[] DEFAULT '{}',
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE unit_premiums ENABLE ROW LEVEL SECURITY;

-- RLS policy: same pattern as other one_pager child tables
CREATE POLICY "Users can manage unit premiums"
ON unit_premiums FOR ALL
USING (true)
WITH CHECK (true);

-- Index for fast lookup by one_pager_id
CREATE INDEX IF NOT EXISTS idx_unit_premiums_one_pager_id
ON unit_premiums(one_pager_id);
