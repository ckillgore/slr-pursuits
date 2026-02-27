-- ============================================================
-- Key Dates Tracking — Database Migration
-- ============================================================

-- 1. Key Date Types lookup table (admin-managed)
CREATE TABLE key_date_types (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    category    text NOT NULL CHECK (category IN ('contract', 'pre_development')),
    color       text NOT NULL DEFAULT '#4A5568',
    sort_order  int  NOT NULL DEFAULT 0,
    is_active   boolean NOT NULL DEFAULT true
);

-- RLS
ALTER TABLE key_date_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read key_date_types"
    ON key_date_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage key_date_types"
    ON key_date_types FOR ALL TO authenticated
    USING (public.get_user_role() IN ('admin', 'owner'))
    WITH CHECK (public.get_user_role() IN ('admin', 'owner'));

-- Seed standard key date types
INSERT INTO key_date_types (name, category, color, sort_order) VALUES
    -- Contract dates
    ('Contract Execution',      'contract', '#2563EB', 1),
    ('Earnest Money Due',       'contract', '#7C3AED', 2),
    ('Option Period Expiry',    'contract', '#DC2626', 3),
    ('Inspection Period End',   'contract', '#EA580C', 4),
    ('Financing Contingency',   'contract', '#CA8A04', 5),
    ('Title Commitment Due',    'contract', '#0891B2', 6),
    ('Survey Due',              'contract', '#4F46E5', 7),
    ('Closing Date',            'contract', '#059669', 8),
    ('Extension Deadline',      'contract', '#BE185D', 9),
    ('Notice Deadline',         'contract', '#9333EA', 10),
    -- Pre-development dates
    ('Zoning Application Filed',     'pre_development', '#2563EB', 11),
    ('Zoning Hearing',               'pre_development', '#4F46E5', 12),
    ('Zoning Approval',              'pre_development', '#059669', 13),
    ('Site Plan Submittal',          'pre_development', '#0891B2', 14),
    ('Site Plan Approval',           'pre_development', '#059669', 15),
    ('Environmental Study Complete', 'pre_development', '#CA8A04', 16),
    ('Geotech Complete',             'pre_development', '#EA580C', 17),
    ('Design Development',           'pre_development', '#7C3AED', 18),
    ('Construction Documents',       'pre_development', '#4F46E5', 19),
    ('Permit Application',           'pre_development', '#2563EB', 20),
    ('Permit Issued',                'pre_development', '#059669', 21),
    ('Groundbreaking Target',        'pre_development', '#DC2626', 22);

-- 2. Key Dates table (per-pursuit)
CREATE TABLE key_dates (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pursuit_id          uuid NOT NULL REFERENCES pursuits(id) ON DELETE CASCADE,
    key_date_type_id    uuid REFERENCES key_date_types(id) ON DELETE SET NULL,
    custom_label        text,
    date_value          date NOT NULL,
    status              text NOT NULL DEFAULT 'upcoming'
                        CHECK (status IN ('upcoming', 'completed', 'overdue', 'waived')),
    notes               text,
    contract_reference  text,
    ai_extracted        boolean NOT NULL DEFAULT false,
    ai_confidence       real,
    sort_order          int NOT NULL DEFAULT 0,
    created_by          uuid REFERENCES auth.users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE TRIGGER key_dates_moddatetime
    BEFORE UPDATE ON key_dates
    FOR EACH ROW
    EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- Indexes
CREATE INDEX idx_key_dates_pursuit ON key_dates(pursuit_id);
CREATE INDEX idx_key_dates_type ON key_dates(key_date_type_id);
CREATE INDEX idx_key_dates_date ON key_dates(date_value);

-- RLS
ALTER TABLE key_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read key_dates"
    ON key_dates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert key_dates"
    ON key_dates FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authenticated users can update key_dates"
    ON key_dates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete key_dates"
    ON key_dates FOR DELETE TO authenticated USING (true);
