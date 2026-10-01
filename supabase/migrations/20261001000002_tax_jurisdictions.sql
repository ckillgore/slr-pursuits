-- ============================================================
-- Tax jurisdictions: property tax rate on file per city / county
-- ============================================================
-- One-pagers were re-keying the same rate by hand (Dallas 2.235%, Charlotte
-- ~0.77%, ...). A pursuit matches a row on state + county + city, falling
-- back to a county-wide row (city NULL). New one-pagers take the rate and
-- assessed % from the match; the editor offers it on existing ones.
--
-- tax_rate uses the same unit as one_pagers.tax_mil_rate (0.02235 = 2.235%).

CREATE TABLE IF NOT EXISTS public.tax_jurisdictions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  state text NOT NULL,
  county text NOT NULL,
  city text,
  tax_rate numeric(8,6) NOT NULL DEFAULT 0,
  assessed_pct_hard numeric(5,4) NOT NULL DEFAULT 0.90,
  assessed_pct_land numeric(5,4) NOT NULL DEFAULT 1.00,
  assessed_pct_soft numeric(5,4) NOT NULL DEFAULT 0,
  notes text,
  is_verified boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.tax_jurisdictions.city IS 'NULL = applies county-wide when no city row matches.';
COMMENT ON COLUMN public.tax_jurisdictions.is_verified IS 'false = seeded from one-pager history and not yet checked against the tax authority.';

CREATE UNIQUE INDEX IF NOT EXISTS tax_jurisdictions_place_key
  ON public.tax_jurisdictions (lower(state), lower(county), lower(coalesce(city, '')));
CREATE INDEX IF NOT EXISTS idx_tax_jurisdictions_updated_by ON public.tax_jurisdictions (updated_by);

DROP TRIGGER IF EXISTS update_tax_jurisdictions_updated_at ON public.tax_jurisdictions;
CREATE TRIGGER update_tax_jurisdictions_updated_at
  BEFORE UPDATE ON public.tax_jurisdictions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.tax_jurisdictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read" ON public.tax_jurisdictions;
CREATE POLICY "Authenticated read" ON public.tax_jurisdictions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin write" ON public.tax_jurisdictions;
CREATE POLICY "Admin write" ON public.tax_jurisdictions
  FOR ALL TO authenticated
  USING ((select public.get_user_role()) IN ('owner', 'admin'))
  WITH CHECK ((select public.get_user_role()) IN ('owner', 'admin'));

-- Seed: median rate and most common assessed % from active one-pagers as of
-- 2026-10-01. Unverified until someone checks the current millage.
-- Left out: Scottsdale (modeled with a 9.3% rate on ~5% assessed, unlike the
-- other Arizona deals) and pursuits with no city.
INSERT INTO public.tax_jurisdictions (state, county, city, tax_rate, assessed_pct_hard, assessed_pct_land, assessed_pct_soft, notes)
VALUES
  ('Arizona',        'Maricopa County',    'Chandler',      0.006500, 1.00, 1.00, 0,    'From 1 one-pager (1 pursuit).'),
  ('Arizona',        'Maricopa County',    'Mesa',          0.009800, 0.85, 0.85, 0,    'From 1 one-pager (1 pursuit).'),
  ('Georgia',        'Cobb County',        'Kennesaw',      0.012060, 0.90, 1.00, 0,    'From 1 one-pager (1 pursuit).'),
  ('Georgia',        'DeKalb County',      'Atlanta',       0.013900, 0.90, 1.00, 0,    'From 1 one-pager (1 pursuit).'),
  ('Georgia',        'DeKalb County',      'Chamblee',      0.009000, 0.90, 1.00, 0,    'Median of 5 one-pagers (2 pursuits); entries ranged 0.88%–1.60%.'),
  ('Georgia',        'DeKalb County',      'Doraville',     0.018600, 0.90, 1.00, 0,    'From 1 one-pager (1 pursuit).'),
  ('Georgia',        'Fulton County',      'Alpharetta',    0.012748, 0.90, 1.00, 0,    'From 1 one-pager (1 pursuit).'),
  ('Georgia',        'Fulton County',      'Atlanta',       0.017388, 0.90, 1.00, 0,    'From 1 one-pager (1 pursuit).'),
  ('Georgia',        'Fulton County',      'Sandy Springs', 0.012340, 0.90, 1.00, 0,    'Median of 3 one-pagers (3 pursuits); all agree.'),
  ('North Carolina', 'Mecklenburg County', 'Charlotte',     0.007700, 0.90, 1.00, 0,    'Median of 33 one-pagers (15 pursuits); entries ranged 0.761%–0.829%.'),
  ('North Carolina', 'Mecklenburg County', 'Davidson',      0.007687, 0.90, 1.00, 0,    'From 2 one-pagers (1 pursuit).'),
  ('North Carolina', 'Wake County',        'Raleigh',       0.009401, 0.90, 1.00, 0.05, 'From 1 one-pager (1 pursuit).'),
  ('South Carolina', 'Charleston County',  'Charleston',    0.016500, 0.85, 1.00, 0,    'Median of 3 one-pagers (2 pursuits); all agree.'),
  ('South Carolina', 'Greenville County',  'Greenville',    0.020000, 0.74, 1.00, 0,    'From 2 one-pagers (1 pursuit).'),
  ('South Carolina', 'York County',        'Tega Cay',      0.034600, 0.90, 1.00, 0,    'From 1 one-pager (1 pursuit). Unusually high — check.'),
  ('Tennessee',      'Davidson County',    'Nashville',     0.011256, 0.90, 1.00, 0,    'Median of 3 one-pagers (3 pursuits); entries ranged 1.126%–1.320%.'),
  ('Tennessee',      'Williamson County',  'Franklin',      0.006264, 0.90, 1.00, 0,    'Median of 6 one-pagers (2 pursuits); all agree.'),
  ('Texas',          'Collin County',      'Plano',         0.017760, 0.90, 1.00, 0,    'Median of 5 one-pagers (2 pursuits); entries ranged 1.688%–1.776%.'),
  ('Texas',          'Dallas County',      'Dallas',        0.022350, 0.90, 0.90, 0,    'Median of 15 one-pagers (10 pursuits); entries ranged 2.190%–2.393%.'),
  ('Texas',          'Denton County',      'The Colony',    0.019000, 0.90, 1.00, 0,    'From 2 one-pagers (1 pursuit).'),
  ('Texas',          'Harris County',      'Houston',       0.019348, 0.90, 0.90, 0,    'Median of 4 one-pagers (4 pursuits); entries ranged 1.700%–2.255%.'),
  ('Texas',          'Travis County',      'Austin',        0.015140, 0.90, 0.90, 0,    'From 1 one-pager (1 pursuit).')
ON CONFLICT DO NOTHING;
