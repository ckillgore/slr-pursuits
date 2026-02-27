-- Add demographics JSONB column to pursuits
ALTER TABLE pursuits ADD COLUMN IF NOT EXISTS demographics jsonb DEFAULT NULL;
ALTER TABLE pursuits ADD COLUMN IF NOT EXISTS demographics_updated_at timestamptz DEFAULT NULL;
