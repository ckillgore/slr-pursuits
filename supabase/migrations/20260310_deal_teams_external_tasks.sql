-- Deal Teams
CREATE TABLE IF NOT EXISTS pursuit_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pursuit_id UUID NOT NULL REFERENCES pursuits(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(pursuit_id, user_id)
);

-- External Task Parties
CREATE TABLE IF NOT EXISTS external_task_parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT,
    company TEXT,
    type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Add tracking fields to pursuit_checklist_tasks
ALTER TABLE pursuit_checklist_tasks 
    ADD COLUMN IF NOT EXISTS assigned_external_party_id UUID REFERENCES external_task_parties(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS external_portal_token UUID UNIQUE DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS external_portal_enabled BOOLEAN NOT NULL DEFAULT false;

-- RLS Policies for pursuit_team_members
ALTER TABLE pursuit_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON pursuit_team_members
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON pursuit_team_members
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users only" ON pursuit_team_members
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable delete for authenticated users only" ON pursuit_team_members
    FOR DELETE TO authenticated USING (true);

-- RLS Policies for external_task_parties
ALTER TABLE external_task_parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON external_task_parties
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON external_task_parties
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users only" ON external_task_parties
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable delete for authenticated users only" ON external_task_parties
    FOR DELETE TO authenticated USING (true);
