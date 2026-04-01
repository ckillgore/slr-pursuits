-- =========================================================================
-- Optimize HelloData Units schema to support UPSERT operations
-- =========================================================================

-- 1. Deduplicate hellodata_units just in case there are existing duplicates
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER(PARTITION BY property_id, hellodata_unit_id ORDER BY updated_at DESC) as rn
  FROM hellodata_units
)
DELETE FROM hellodata_units WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- 2. Deduplicate hellodata_concessions
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER(PARTITION BY property_id, hellodata_concession_id ORDER BY created_at DESC) as rn
  FROM hellodata_concessions
)
DELETE FROM hellodata_concessions WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- 3. Check for NULLs and assign a fallback text if needed (so unique constraints work fully for upsert)
UPDATE hellodata_units
SET hellodata_unit_id = 'NO_ID_' || md5(random()::text)
WHERE hellodata_unit_id IS NULL;

UPDATE hellodata_concessions
SET hellodata_concession_id = 'NO_ID_' || md5(random()::text)
WHERE hellodata_concession_id IS NULL;

-- 4. Add UNIQUE constraints
ALTER TABLE hellodata_units 
  ADD CONSTRAINT uq_hellodata_units_property_unit UNIQUE (property_id, hellodata_unit_id);

ALTER TABLE hellodata_concessions 
  ADD CONSTRAINT uq_hellodata_concess_property_concess UNIQUE (property_id, hellodata_concession_id);
