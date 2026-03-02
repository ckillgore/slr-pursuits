-- Short ID Migration
-- Adds a short_id column (8 URL-safe chars) to pursuits, one_pagers, land_comps, sale_comps
-- UUIDs remain as primary keys; short_id is for URL routing only.

-- Helper function to generate URL-safe short IDs
CREATE OR REPLACE FUNCTION generate_short_id(len int DEFAULT 8)
RETURNS text AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  result text := '';
  i int;
BEGIN
  FOR i IN 1..len LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- === PURSUITS ===
ALTER TABLE pursuits ADD COLUMN IF NOT EXISTS short_id text;
UPDATE pursuits SET short_id = generate_short_id() WHERE short_id IS NULL;
ALTER TABLE pursuits ALTER COLUMN short_id SET NOT NULL;
ALTER TABLE pursuits ALTER COLUMN short_id SET DEFAULT generate_short_id();
CREATE UNIQUE INDEX IF NOT EXISTS idx_pursuits_short_id ON pursuits(short_id);

-- === ONE PAGERS ===
ALTER TABLE one_pagers ADD COLUMN IF NOT EXISTS short_id text;
UPDATE one_pagers SET short_id = generate_short_id() WHERE short_id IS NULL;
ALTER TABLE one_pagers ALTER COLUMN short_id SET NOT NULL;
ALTER TABLE one_pagers ALTER COLUMN short_id SET DEFAULT generate_short_id();
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pagers_short_id ON one_pagers(short_id);

-- === LAND COMPS ===
ALTER TABLE land_comps ADD COLUMN IF NOT EXISTS short_id text;
UPDATE land_comps SET short_id = generate_short_id() WHERE short_id IS NULL;
ALTER TABLE land_comps ALTER COLUMN short_id SET NOT NULL;
ALTER TABLE land_comps ALTER COLUMN short_id SET DEFAULT generate_short_id();
CREATE UNIQUE INDEX IF NOT EXISTS idx_land_comps_short_id ON land_comps(short_id);

-- === SALE COMPS ===
ALTER TABLE sale_comps ADD COLUMN IF NOT EXISTS short_id text;
UPDATE sale_comps SET short_id = generate_short_id() WHERE short_id IS NULL;
ALTER TABLE sale_comps ALTER COLUMN short_id SET NOT NULL;
ALTER TABLE sale_comps ALTER COLUMN short_id SET DEFAULT generate_short_id();
CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_comps_short_id ON sale_comps(short_id);
