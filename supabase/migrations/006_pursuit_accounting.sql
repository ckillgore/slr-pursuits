-- ============================================================
-- Pursuit Accounting Mapping
-- ============================================================

CREATE TABLE pursuit_accounting_entities (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pursuit_id          uuid NOT NULL REFERENCES pursuits(id) ON DELETE CASCADE,
    property_code       text NOT NULL,
    job_id              integer,
    is_primary          boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (pursuit_id, property_code)
);

CREATE INDEX idx_pae_pursuit ON pursuit_accounting_entities(pursuit_id);
CREATE INDEX idx_pae_property ON pursuit_accounting_entities(property_code);

CREATE TRIGGER update_pursuit_accounting_entities_updated_at
    BEFORE UPDATE ON pursuit_accounting_entities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE pursuit_accounting_entities ENABLE ROW LEVEL SECURITY;

-- Reading is allowed for all authenticated users (team scoped could apply later)
CREATE POLICY "Authenticated read pursuit accounting entities" 
    ON pursuit_accounting_entities FOR SELECT TO authenticated USING (true);

-- Only admins can manage the accounting entity mapping
CREATE POLICY "Admin manage pursuit accounting entities" 
    ON pursuit_accounting_entities FOR ALL TO authenticated
    USING (public.get_user_role() IN ('admin','owner')) 
    WITH CHECK (public.get_user_role() IN ('admin','owner'));
