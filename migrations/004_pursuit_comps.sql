-- Migration 004: Junction tables for linking land comps and sale comps to pursuits
-- Run this in Supabase SQL Editor

-- Land comps linked to pursuits
CREATE TABLE IF NOT EXISTS pursuit_land_comps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pursuit_id UUID NOT NULL REFERENCES pursuits(id) ON DELETE CASCADE,
  land_comp_id UUID NOT NULL REFERENCES land_comps(id) ON DELETE CASCADE,
  added_by UUID REFERENCES auth.users(id),
  added_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  sort_order INT DEFAULT 0,
  UNIQUE(pursuit_id, land_comp_id)
);

-- Sale comps linked to pursuits
CREATE TABLE IF NOT EXISTS pursuit_sale_comps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pursuit_id UUID NOT NULL REFERENCES pursuits(id) ON DELETE CASCADE,
  sale_comp_id UUID NOT NULL REFERENCES sale_comps(id) ON DELETE CASCADE,
  added_by UUID REFERENCES auth.users(id),
  added_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  sort_order INT DEFAULT 0,
  UNIQUE(pursuit_id, sale_comp_id)
);

-- RLS
ALTER TABLE pursuit_land_comps ENABLE ROW LEVEL SECURITY;
ALTER TABLE pursuit_sale_comps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage pursuit_land_comps"
  ON pursuit_land_comps FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage pursuit_sale_comps"
  ON pursuit_sale_comps FOR ALL USING (auth.role() = 'authenticated');
