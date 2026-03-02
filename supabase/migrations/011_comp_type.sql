-- Add comp_type column to pursuit_rent_comps for primary/secondary designation
ALTER TABLE pursuit_rent_comps
ADD COLUMN IF NOT EXISTS comp_type TEXT NOT NULL DEFAULT 'primary'
CHECK (comp_type IN ('primary', 'secondary'));

-- Add index for filtering by comp_type
CREATE INDEX IF NOT EXISTS idx_pursuit_rent_comps_type ON pursuit_rent_comps(pursuit_id, comp_type);
