-- Sale Comps: property/building records with child sale transactions
-- Supports multiple sales at the same address/property

-- Parent: property/building info
CREATE TABLE sale_comps (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              text NOT NULL,
  address           text NOT NULL DEFAULT '',
  city              text NOT NULL DEFAULT '',
  state             text NOT NULL DEFAULT '',
  county            text NOT NULL DEFAULT '',
  zip               text NOT NULL DEFAULT '',
  latitude          double precision,
  longitude         double precision,
  property_type     text,
  year_built        integer,
  total_units       integer,
  total_sf          numeric,
  lot_size_sf       numeric DEFAULT 0,
  notes             jsonb,
  parcel_data       jsonb,
  parcel_data_updated_at timestamptz,
  created_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Child: individual sale transactions
CREATE TABLE sale_transactions (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_comp_id      uuid NOT NULL REFERENCES sale_comps(id) ON DELETE CASCADE,
  sale_date         date,
  sale_price        numeric,
  cap_rate          numeric,
  price_per_unit    numeric,
  price_per_sf      numeric,
  buyer             text,
  seller            text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sale_transactions_comp ON sale_transactions(sale_comp_id);

ALTER TABLE sale_comps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON sale_comps
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON sale_transactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
