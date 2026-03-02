-- ============================================================
-- Hellodata Rent Comps — Schema Migration
-- Central cache for Hellodata multifamily property data
-- ============================================================

-- ============================================================
-- 1. hellodata_properties — Central cache of property details
-- ============================================================
CREATE TABLE hellodata_properties (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  hellodata_id text NOT NULL UNIQUE,

  -- Core property info
  building_name text,
  street_address text,
  city text,
  state text,
  zip_code text,
  lat numeric(10,7),
  lon numeric(10,7),
  year_built integer,
  number_units integer,
  number_stories integer,
  msa text,
  management_company text,
  building_website text,
  building_phone text,

  -- Property classification
  is_single_family boolean DEFAULT false,
  is_apartment boolean DEFAULT true,
  is_condo boolean DEFAULT false,
  is_senior boolean DEFAULT false,
  is_student boolean DEFAULT false,
  is_build_to_rent boolean DEFAULT false,
  is_affordable boolean DEFAULT false,
  is_lease_up boolean DEFAULT false,

  -- Structured data (jsonb)
  building_quality jsonb,         -- {property_overall_quality, avg_quality_score_*}
  pricing_strategy jsonb,         -- {is_using_rev_management, avg_duration, ...}
  review_analysis jsonb,          -- {avg_score, count_reviews, positive/negative_counts}
  demographics jsonb,             -- Census tract demographics
  fees jsonb,                     -- {admin_fee, application_fee, parking_*, pet_*}
  occupancy_over_time jsonb,      -- [{as_of, leased, exposure}, ...]

  -- Arrays
  building_amenities text[] DEFAULT '{}',
  unit_amenities text[] DEFAULT '{}',

  -- Full API response (for future-proofing)
  raw_response jsonb,

  -- Cache management
  fetched_at timestamptz NOT NULL DEFAULT now(),
  data_as_of date,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hellodata_properties_hellodata_id ON hellodata_properties(hellodata_id);
CREATE INDEX idx_hellodata_properties_city_state ON hellodata_properties(city, state);
CREATE INDEX idx_hellodata_properties_fetched_at ON hellodata_properties(fetched_at);

-- ============================================================
-- 2. hellodata_units — Unit / floorplan-level data
-- ============================================================
CREATE TABLE hellodata_units (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id uuid NOT NULL REFERENCES hellodata_properties(id) ON DELETE CASCADE,
  hellodata_unit_id text,

  -- Unit details
  is_floorplan boolean DEFAULT false,
  bed integer,
  bath numeric(3,1),
  partial_bath integer DEFAULT 0,
  sqft numeric(10,1),
  min_sqft numeric(10,1),
  max_sqft numeric(10,1),
  floorplan_name text,
  unit_name text,
  floor integer,

  -- Pricing (current snapshot)
  price numeric(10,2),
  min_price numeric(10,2),
  max_price numeric(10,2),
  effective_price numeric(10,2),
  min_effective_price numeric(10,2),
  max_effective_price numeric(10,2),

  -- Lease / Market
  days_on_market integer,
  lease_term integer,
  enter_market date,
  exit_market date,
  availability date,

  -- Nested data (stored as jsonb)
  amenities text[] DEFAULT '{}',
  tags text[] DEFAULT '{}',
  history jsonb,                  -- [{from_date, to_date, price, effective_price, ...}]
  availability_periods jsonb,     -- [{period_id, enter_market, exit_market, days_on_market, ...}]
  price_plans jsonb,              -- [{duration_in_months, price, effective_price, specials}]

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hellodata_units_property ON hellodata_units(property_id);
CREATE INDEX idx_hellodata_units_bed ON hellodata_units(bed);

-- ============================================================
-- 3. hellodata_concessions — Concession history
-- ============================================================
CREATE TABLE hellodata_concessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id uuid NOT NULL REFERENCES hellodata_properties(id) ON DELETE CASCADE,
  hellodata_concession_id text,

  concession_text text,
  from_date date,
  to_date date,
  items jsonb,   -- [{condition_lease_term_months, free_weeks_count, free_months_count, ...}]

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hellodata_concessions_property ON hellodata_concessions(property_id);
CREATE INDEX idx_hellodata_concessions_dates ON hellodata_concessions(from_date, to_date);

-- ============================================================
-- 4. pursuit_rent_comps — Links pursuits to Hellodata properties
-- ============================================================
CREATE TABLE pursuit_rent_comps (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pursuit_id uuid NOT NULL REFERENCES pursuits(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES hellodata_properties(id) ON DELETE CASCADE,

  added_by uuid REFERENCES auth.users(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  sort_order integer NOT NULL DEFAULT 0,

  UNIQUE(pursuit_id, property_id)
);

CREATE INDEX idx_pursuit_rent_comps_pursuit ON pursuit_rent_comps(pursuit_id);
CREATE INDEX idx_pursuit_rent_comps_property ON pursuit_rent_comps(property_id);

-- ============================================================
-- 5. hellodata_fetch_log — Audit / cost tracking
-- ============================================================
CREATE TABLE hellodata_fetch_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  hellodata_id text NOT NULL,
  endpoint text NOT NULL,
  response_status integer,
  fetched_by uuid REFERENCES auth.users(id),
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hellodata_fetch_log_id ON hellodata_fetch_log(hellodata_id);
CREATE INDEX idx_hellodata_fetch_log_at ON hellodata_fetch_log(fetched_at);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE hellodata_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE hellodata_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE hellodata_concessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pursuit_rent_comps ENABLE ROW LEVEL SECURITY;
ALTER TABLE hellodata_fetch_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON hellodata_properties FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON hellodata_units FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON hellodata_concessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON pursuit_rent_comps FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON hellodata_fetch_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Updated_at triggers (reuse existing function)
-- ============================================================
CREATE TRIGGER trg_hellodata_properties_updated
  BEFORE UPDATE ON hellodata_properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_hellodata_units_updated
  BEFORE UPDATE ON hellodata_units
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
