-- Add capex reserves column to one_pagers and data_models
ALTER TABLE one_pagers ADD COLUMN IF NOT EXISTS opex_capex_reserves numeric NOT NULL DEFAULT 0;
ALTER TABLE data_model_templates ADD COLUMN IF NOT EXISTS default_opex_capex_reserves numeric NOT NULL DEFAULT 0;
